# 打包成 APK

`android/` 是一个标准的 Android Gradle 工程（Kotlin + WebView），负责把上层的网页文件原样装进 APK。
**你平时只改上层的 `index.html` / `css` / `js` / `plugins`，构建时会自动同步进包里**，不需要手动复制任何文件。

---

## 0. 前置条件

| 需要 | 版本 | 说明 |
|---|---|---|
| Android Studio | Hedgehog (2023.1) 或更新 | 最省事，推荐 |
| JDK | 17 | AGP 8.2 强制要求 |
| Android SDK Platform | 34 | `compileSdk = 34` |
| Android Build-Tools | 34.x | |
| Gradle | 8.2+ | 本工程用的 AGP 版本 `8.2.2` 要求 Gradle ≥ 8.2 |

### ⚠️ 关于 `gradlew`

这个工程**没有附带 `gradlew` / `gradlew.bat` / `gradle/wrapper/gradle-wrapper.jar`**
（wrapper 的 jar 是二进制文件，纯文本方式没法可靠地生成）。

两种应对方式，任选其一：

- **用 Android Studio 打开**：它会自动补齐 Gradle 环境，你完全不用管 wrapper。← 推荐
- **命令行**：先确认 `gradle -v` 能跑（≥ 8.2），然后进 `android/` 执行一次
  ```bash
  gradle wrapper --gradle-version 8.2
  ```
  之后就有 `./gradlew` 了。（也可以跳过 wrapper，直接用 `gradle assembleDebug`。）

---

## 1. 用 Android Studio 打包（推荐）

1. Android Studio → **Open** → 选中 `android/` 这个目录（**不是**上层目录）。
2. 等 Gradle Sync 完成。首次会下载 AGP / Kotlin / androidx 依赖，需要网络。
3. **Build → Build Bundle(s) / APK(s) → Build APK(s)**。
4. 右下角弹窗点 **locate**，产物在：
   ```
   android/app/build/outputs/apk/debug/app-debug.apk
   ```
5. 把 APK 拷到手机安装（需要允许「安装未知来源应用」）。

命令行等价：

```bash
cd android
./gradlew assembleDebug        # 或 gradle assembleDebug
# 产物：app/build/outputs/apk/debug/app-debug.apk
```

安装到已连接的设备：

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

---

## 2. 打正式版（自己签名）

`app/build.gradle.kts` 已经写好了条件逻辑：只要在 `android/` 下放一个 `keystore.properties`，
它就会自动建一个 `release` 签名配置并用到 release 构建上；**没放这个文件也不会报错**，只是产出的是 debug 包。

1. 生成 keystore（只做一次，**务必备份，丢了就没法给同一个 App 更新版本**）：

   ```bash
   keytool -genkeypair -v \
     -keystore my-release.jks \
     -alias flashcards \
     -keyalg RSA -keysize 2048 -validity 10000
   ```

2. 新建 `android/keystore.properties`：

   ```properties
   storeFile=../my-release.jks
   storePassword=你的store密码
   keyAlias=flashcards
   keyPassword=你的key密码
   ```

   > `storeFile` 是相对 `android/app/` 解析的，所以 `../my-release.jks` 指 `android/my-release.jks`。
   > **这个文件和 `.jks` 都不要提交到公开仓库。**

3. 构建：

   ```bash
   ./gradlew assembleRelease
   # 产物：app/build/outputs/apk/release/app-release.apk
   ```

---

## 3. 想改 App 名字 / 图标 / 包名

| 想改什么 | 改哪里 |
|---|---|
| App 显示名 | `app/src/main/res/values/strings.xml` 里的 `app_name` |
| 图标 | `app/src/main/res/drawable/ic_launcher_foreground.xml`（自适应图标前景）+ `values/colors.xml` 里的 `ic_launcher_background` |
| 包名 / applicationId | `app/build.gradle.kts` 的 `namespace` 和 `applicationId`，以及 `MainActivity.kt` 第一行的 `package`，再把源码目录挪到对应路径 |
| 主题色 / 状态栏色 | `res/values/colors.xml`、`res/values/themes.xml`（深色在 `values-night/`） |
| 最低支持的 Android 版本 | `app/build.gradle.kts` 的 `minSdk`（当前 24 = Android 7.0） |

---

## 4. 网页文件是怎么进包的

`app/build.gradle.kts` 里注册了一个 `Sync` 任务 `syncWebAssets`：

```
include("index.html")  include("app.css")  include("js/**")  include("plugins/**")
        ↑ 来自 projectDir/..  =  闪卡工具/
                        ↓
        app/build/generated/webassets/www/
```

这个目录被挂进 `sourceSets["main"].assets`，所以最终 APK 内是 `assets/www/...`。
`mergeAssets` 和 `preBuild` 都依赖了 `syncWebAssets`，因此**每次构建都会重新同步**，不会用到旧缓存。

> 你**不需要**把网页文件复制到 `app/src/main/assets/`。那里放东西也没用——
> 真正的 assets 目录是构建时生成的那个。

`MainActivity` 通过 `WebViewAssetLoader` 把 `assets/www/` 映射成虚拟域名：

```
https://appassets.androidplatform.net/assets/www/index.html
```

**为什么不直接用 `file://`？** 因为 `file://` 的 origin 是 `null`，
部分 ROM 上 `localStorage` 会不可用或不持久，而这个 App 的数据**全在 `localStorage` 里**。
虚拟 https 域名给了一个稳定的 origin，存档就可靠了。

### 4.1 AI 请求为什么不走网页的 fetch

虚拟域名带来一个副作用：网页 `fetch("https://api.openai.com/...")` 属于**跨源请求**，
服务端不返回 `Access-Control-Allow-Origin` 就会被 WebView 拦掉（很多大模型服务就是不返回），
表现是设置页点「连接测试」报「Failed to fetch」。

所以 `MainActivity` 里多了一个桥：

```kotlin
@JavascriptInterface
fun httpRequest(url: String, method: String, headersJson: String,
                body: String?, timeoutMs: Int): String
```

`js/ai.js` 里的 `doRequest()` 会先探测这个桥：**有桥就走原生发请求**（原生没有同源策略，
CORS 问题也就不存在），返回一个 JSON 信封 `{"ok":true,"status":200,"body":"..."}`；
**没有桥（也就是直接用浏览器打开 `index.html`）就回落到 `fetch`**。
两条路对上层完全一致，所以同一份网页在浏览器和 APK 里都能跑。

> ⚠️ 不能用 `shouldInterceptRequest` 来干这件事：那个回调**拿不到 POST 的请求体**，
> 而 AI 调用全是 POST。这是它的固有局限，不是没写对。
>
> 注意 `httpRequest` 是从 WebView 的 JavaBridge 线程调进来的（不是主线程），
> 所以里面能直接做网络 I/O；反过来说，**不能在它里面碰任何 View**。

---

## 5. 构建后怎么验证（重要，别跳过）

装到手机上，依次确认：

1. **页面能打开**（不是白屏）。
   白屏 + 一句「页面加载失败」的 Toast → assets 没同步进去，检查 `syncWebAssets` 是否执行过。
2. **建一张卡片，杀掉 App，重开**——卡片还在。这验证的是 `localStorage` 持久化，
   也就是 `domStorageEnabled = true` 和虚拟域名这两件事都对。
3. **设置 → 导出备份** → 弹出「已保存到『下载』」。去系统文件管理的「下载」目录能看到那个 json。
   （Android 10+ 走 MediaStore，不需要任何权限；Android 9 及以下会先申请存储权限。）
4. **导入**：设置 → 恢复备份 → 选文件，应该能拉起系统文件选择器。
5. **装一个示例插件**：插件页 → 从文件导入 → 选 `plugins/01-vocab.json`，应提示安装成功。
6. **AI 调用**（可选）：设置页填好地址和 Key，点「连接测试」。
   Android 10+ 的明文 http（如本地 Ollama）靠 `usesCleartextTraffic="true"` 放行。

---

## 6. 常见问题

| 现象 | 原因 / 处理 |
|---|---|
| `./gradlew: No such file or directory` | 见上面第 0 节，本工程没带 wrapper。用 Android Studio，或先 `gradle wrapper`。 |
| `SDK location not found` | 缺 `local.properties`。Android Studio 会自动生成；命令行则手写一行 `sdk.dir=/你的/Android/Sdk`。 |
| `Failed to find Build Tools revision 34.0.0` | SDK Manager 里装 Android SDK Build-Tools 34。 |
| Sync 报 AGP 版本不支持 | Gradle 太旧。AGP 8.2.2 需要 Gradle ≥ 8.2、JDK 17。 |
| App 里白屏但浏览器正常 | 没跑到构建就一定没有 assets。单独跑 `./gradlew syncWebAssets` 看 `app/build/generated/webassets/www/` 里有没有东西。 |
| AI 连不上本地 Ollama | `usesCleartextTraffic="true"` 已经开了（允许 http）。另外模拟器访问宿主机要用 `10.0.2.2` 而不是 `localhost`。 |
| 点「连接测试」报「网络错误」 | 先看 Toast/输入框下方的详情：`HTTP 401` 是 Key 错，`HTTP 404` 是 Base URL 里的 `/v1` 多了或少了，连不上就是网络或地址问题。APK 里已经走原生代发，**不是 CORS**。 |
| 想确认 AI 走的是原生还是 fetch | 桥不存在时会回落 `fetch`。在 APK 里若报「Failed to fetch」，说明 `httpRequest` 桥没生效，检查 `MainActivity` 里的 `@JavascriptInterface fun httpRequest` 是否被混淆掉了（`proguard-rules.pro` 已保留 `NativeBridge` 的成员）。 |
| 分词/智能挖空效果差 | `Intl.Segmenter` 需要较新的 WebView（Chrome 87+）。系统 WebView 太旧时会自动退回内置的简易分词，功能仍可用但精度下降。升级「Android System WebView」即可。 |
| 导出文件名是乱码 | 文件名里的非法字符已经被替换成 `_`，这是预期行为。 |

---

## 7. 调试

- debug 包里 `MainActivity` 打开了 `WebView.setWebContentsDebuggingEnabled`。
  连电脑后用 Chrome 打开 `chrome://inspect`，可以直接对着手机上的页面开 DevTools——
  改 JS 和调 CSS 的体验和在桌面浏览器里一样。
- release 包里调试是关掉的。
- 网页里的 `console.log` 在 debug 构建下会转发到 Logcat，tag 是 `FlashCards`：

  ```bash
  adb logcat -s FlashCards
  ```
