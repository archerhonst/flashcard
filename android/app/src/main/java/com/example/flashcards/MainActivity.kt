package com.example.flashcards

import android.Manifest
import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.ContentValues
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.webkit.ConsoleMessage
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * 闪卡 App 的容器：一个 WebView + 一个资源加载器 + 一个文件保存桥。
 *
 * 关键设计：
 *  1) 页面不从 file:// 加载，而是用 WebViewAssetLoader 映射成
 *     https://appassets.androidplatform.net/assets/www/index.html
 *     —— 这样 localStorage 有一个稳定的、可持久化的 origin。
 *     直接用 file:// 时，部分 ROM 上 localStorage 会失效或重启后丢失。
 *  2) WebView 不支持 blob: + <a download> 的下载，所以导出备份/插件
 *     走 JS 桥 NativeBridge.saveFile 写进系统「下载」目录。
 *  3) 导入文件靠 WebChromeClient.onShowFileChooser 打开系统选择器。
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var assetLoader: WebViewAssetLoader

    /** onShowFileChooser 的结果回调（为 null 表示当前没有待处理的请求） */
    private var pendingFileCallback: ValueCallback<Array<Uri>>? = null

    private val filePicker = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val cb = pendingFileCallback ?: return@registerForActivityResult
        pendingFileCallback = null
        val uris: Array<Uri>? = when {
            result.resultCode != RESULT_OK -> null
            result.data?.clipData != null -> {
                val clip = result.data!!.clipData!!
                Array(clip.itemCount) { clip.getItemAt(it).uri }
            }
            result.data?.data != null -> arrayOf(result.data!!.data!!)
            else -> null
        }
        cb.onReceiveValue(uris)
    }

    private val storagePermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (!granted) {
            toast("没有存储权限，导出的文件会存到 App 私有目录")
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Android 9 及以下写公共下载目录需要权限；10+ 用 MediaStore 不需要
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            val ok = ContextCompat.checkSelfPermission(
                this, Manifest.permission.WRITE_EXTERNAL_STORAGE
            ) == PackageManager.PERMISSION_GRANTED
            if (!ok) storagePermission.launch(Manifest.permission.WRITE_EXTERNAL_STORAGE)
        }

        assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView = WebView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }
        setContentView(webView)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        }

        configureSettings()
        webView.addJavascriptInterface(NativeBridge(), "FlashCardsNative")
        webView.webViewClient = AppWebViewClient()
        webView.webChromeClient = AppChromeClient()
        webView.setDownloadListener { url, _, _, _, _ ->
            // 兜底：网页里如果出现普通的 http(s) 下载链接
            if (url.startsWith("http://") || url.startsWith("https://")) {
                runCatching { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
            } else {
                toast("这个文件没法直接保存（$url）")
            }
        }

        webView.loadUrl(START_URL)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else finish()
            }
        })
    }

    private fun configureSettings() = with(webView.settings) {
        javaScriptEnabled = true
        domStorageEnabled = true          // localStorage —— 数据全靠它
        databaseEnabled = true
        loadsImagesAutomatically = true
        mediaPlaybackRequiresUserGesture = false
        // 页面 origin 是 https，而 Ollama / LM Studio 常跑在 http://localhost，
        // 不放开会命中混合内容拦截
        mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        // 只从资源加载器取文件，不放行 file://
        allowFileAccess = false
        // 必须保持 true：导入插件/恢复备份要把系统文件选择器返回的
        // content:// 交给 FileReader 读。导航层面已在
        // shouldOverrideUrlLoading 里挡掉了非本站地址，所以不会误加载。
        allowContentAccess = true
        javaScriptCanOpenWindowsAutomatically = false
        setSupportZoom(true)
        builtInZoomControls = false
        cacheMode = WebSettings.LOAD_DEFAULT
    }

    /**
     * 让 WebView 进入 paused 状态。这不是可有可无的：
     * Chromium 的 localStorage 是在页面变为 hidden 时才提交落盘的，
     * 而 WebView.onPause() 会触发 visibilitychange。
     * 不调用的话，用返回键/切后台直接杀掉进程可能丢掉最后的编辑。
     */
    override fun onPause() {
        super.onPause()
        webView.onPause()
        CookieManager.getInstance().flush()
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onDestroy() {
        // 从视图树摘掉，避免 WebView 持有已销毁的 Activity
        (webView.parent as? ViewGroup)?.removeView(webView)
        webView.destroy()
        super.onDestroy()
    }

    private fun toast(msg: String) = runOnUiThread {
        Toast.makeText(this, msg, Toast.LENGTH_LONG).show()
    }

    /* ============================================================
     * WebViewClient
     * ============================================================ */
    private inner class AppWebViewClient : WebViewClient() {

        override fun shouldInterceptRequest(
            view: WebView, request: WebResourceRequest
        ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)

        override fun shouldOverrideUrlLoading(
            view: WebView, request: WebResourceRequest
        ): Boolean {
            val url = request.url.toString()
            if (url.startsWith(BASE_URL)) return false      // 自己的页面，正常加载
            // 其它一律不在 App 里加载：能交给系统就打系统 App，交不出去就丢掉。
            // （这样 content://、intent://、第三方站点都不会顶掉闪卡壳）
            runCatching { startActivity(Intent(Intent.ACTION_VIEW, request.url)) }
                .onFailure { Log.w(TAG, "无法外部打开：$url") }
            return true
        }

        override fun onReceivedError(
            view: WebView, request: WebResourceRequest, error: WebResourceError
        ) {
            // 只关心主文档失败：通常意味着 assets 没同步进去（没跑 Gradle 构建）
            if (!request.isForMainFrame) return
            val detail = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                "${error.errorCode} ${error.description}"
            } else {
                "未知错误"
            }
            Log.e(TAG, "主文档加载失败：$detail  url=${request.url}")
            toast("页面加载失败（$detail）。请确认 APK 里已打入网页资源。")
        }
    }

    /* ============================================================
     * WebChromeClient：文件选择 + 控制台转发
     * ============================================================ */
    private inner class AppChromeClient : WebChromeClient() {

        override fun onShowFileChooser(
            webView: WebView,
            filePathCallback: ValueCallback<Array<Uri>>,
            fileChooserParams: FileChooserParams
        ): Boolean {
            pendingFileCallback?.onReceiveValue(null)
            pendingFileCallback = filePathCallback
            val intent = fileChooserParams.createIntent().apply {
                addCategory(Intent.CATEGORY_OPENABLE)
            }
            return try {
                filePicker.launch(Intent.createChooser(intent, "选择文件"))
                true
            } catch (e: ActivityNotFoundException) {
                // 一定要回调 null：否则 WebView 会一直等着这个 file chooser，
                // 页面上后续的 <input type="file"> 会彻底失灵。
                pendingFileCallback = null
                filePathCallback.onReceiveValue(null)
                toast("这台设备没有可用的文件选择器")
                false
            }
        }

        override fun onPermissionRequest(request: PermissionRequest) {
            // 页面不需要摄像头/麦克风，全部拒绝
            request.deny()
        }

        override fun onConsoleMessage(msg: ConsoleMessage): Boolean {
            if (BuildConfig.DEBUG) {
                Log.d(TAG, "${msg.message()} @${msg.sourceId()}:${msg.lineNumber()}")
            }
            return true
        }
    }

    /* ============================================================
     * JS 桥：把导出的文本写进系统「下载」目录
     * 网页侧调用：FlashCardsNative.saveFile(name, text, mime)
     * 返回 false 时网页会回落到标准 blob 下载。
     * ============================================================ */
    inner class NativeBridge {

        @JavascriptInterface
        fun saveFile(name: String, text: String, mime: String): Boolean {
            return try {
                val safe = name
                    .replace(Regex("""[/\\:*?"<>|\u0000-\u001f]"""), "_")
                    .trim()
                    .ifBlank { "flashcards.json" }
                val bytes = text.toByteArray(Charsets.UTF_8)

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    saveViaMediaStore(safe, bytes, mime.ifBlank { "application/json" })
                } else {
                    saveViaPublicDir(safe, bytes)
                }
                toast("已保存到「下载」：$safe")
                true
            } catch (t: Throwable) {
                Log.e(TAG, "saveFile failed", t)
                toast("保存失败：${t.message}")
                false
            }
        }

        /**
         * 代发一次 HTTP 请求，绕过浏览器的同源策略。
         *
         * 为什么需要它：页面是从虚拟域名 https://appassets.androidplatform.net 加载的，
         * 网页里 fetch 第三方 API 属于跨源请求，服务端不返回 CORS 头就会被 WebView 拦掉
         * （很多大模型服务就是不返回）。原生发请求没有同源策略，所以 AI 调用改走这里。
         *
         * 注意：本方法由 WebView 在 JavaBridge 线程调用，不是主线程，
         * 所以可以直接做网络 I/O，但不能碰任何 View。
         *
         * @return JSON 字符串：{"ok":true,"status":200,"body":"..."} 或 {"ok":false,"error":"..."}
         */
        @JavascriptInterface
        fun httpRequest(url: String, method: String, headersJson: String, body: String?, timeoutMs: Int): String {
            val scheme = Uri.parse(url).scheme?.lowercase()
            if (scheme != "http" && scheme != "https") return errJson("协议不支持：$scheme")
            return try {
                val conn = (URL(url).openConnection() as HttpURLConnection).apply {
                    requestMethod = method.ifBlank { "POST" }.uppercase()
                    connectTimeout = 15000
                    readTimeout = if (timeoutMs > 0) timeoutMs else 90000
                    instanceFollowRedirects = true
                    doInput = true
                }
                // 透传网页给的请求头（Host/Content-Length 由 HttpURLConnection 自己算，不能手填）
                try {
                    val hj = if (headersJson.isBlank()) JSONObject() else JSONObject(headersJson)
                    hj.keys().forEach { k ->
                        if (!k.equals("host", true) && !k.equals("content-length", true) &&
                            !k.equals("connection", true)
                        ) {
                            conn.setRequestProperty(k, hj.optString(k))
                        }
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "解析请求头失败，按无自定义头处理", e)
                }

                val payload = body?.toByteArray(Charsets.UTF_8)
                if (payload != null) {
                    conn.doOutput = true
                    conn.setFixedLengthStreamingMode(payload.size)
                    conn.outputStream.use { it.write(payload) }
                }

                val status = conn.responseCode
                val text = (if (status in 200..299) conn.inputStream else conn.errorStream)
                    ?.use { it.readBytes().toString(Charsets.UTF_8) } ?: ""
                JSONObject().put("ok", true).put("status", status).put("body", text).toString()
            } catch (t: Throwable) {
                Log.e(TAG, "httpRequest failed: $url", t)
                errJson(t.message ?: t.javaClass.simpleName)
            }
        }

        private fun errJson(msg: String): String =
            JSONObject().put("ok", false).put("error", msg).toString()

        /** Android 10+：走 MediaStore，不需要任何权限，文件出现在「下载」里 */
        private fun saveViaMediaStore(name: String, bytes: ByteArray, mime: String) {
            val resolver = contentResolver
            val values = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, name)
                put(MediaStore.Downloads.MIME_TYPE, mime)
                put(MediaStore.Downloads.IS_PENDING, 1)
            }
            val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                ?: error("系统拒绝创建文件")
            resolver.openOutputStream(uri)?.use { it.write(bytes) }
                ?: error("无法打开输出流")
            values.clear()
            values.put(MediaStore.Downloads.IS_PENDING, 0)
            resolver.update(uri, values, null, null)
        }

        /** Android 9 及以下：直接写公共下载目录（已申请 WRITE_EXTERNAL_STORAGE） */
        private fun saveViaPublicDir(name: String, bytes: ByteArray) {
            val granted = ContextCompat.checkSelfPermission(
                this@MainActivity, Manifest.permission.WRITE_EXTERNAL_STORAGE
            ) == PackageManager.PERMISSION_GRANTED

            val dir = if (granted) {
                Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
            } else {
                getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
                    ?: filesDir
            }
            if (!dir.exists()) dir.mkdirs()
            File(dir, name).writeBytes(bytes)
        }
    }

    companion object {
        private const val TAG = "FlashCards"
        private const val BASE_URL = "https://appassets.androidplatform.net"
        private const val START_URL = "$BASE_URL/assets/www/index.html"
    }
}
