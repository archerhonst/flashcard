#!/usr/bin/env node
/**
 * 检查 APK 壳（工作区里的「闪卡」Java 工程）与网页本体是否还对得上。
 *
 * 为什么需要它：
 *   这一轮把 闪卡工具/ 的网页**复制**进了 闪卡/app/src/main/assets/www/。
 *   副本一旦和本体不一致，就会出现「改了网页、装出来的 APK 却没变」这种
 *   最难查的问题 —— 因为两边看起来都是对的。
 *   本机没有 javac / Android SDK，Java 编译不过没法本地验证，
 *   所以只能做结构检查（括号配平、桥签名、资源 id、权限声明）。
 *
 * 用法：
 *   node tools/check-apk-shell.js          只检查
 *   node tools/check-apk-shell.js --sync   先同步副本，再检查
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SYNC = process.argv.indexOf('--sync') >= 0;

const WEB_ROOT = path.resolve(__dirname, '..');
const APK_ROOT = path.resolve(WEB_ROOT, '..', '闪卡');
const APK_MAIN = path.join(APK_ROOT, 'app', 'src', 'main');
const APK_WWW = path.join(APK_MAIN, 'assets', 'www');

const JAVA = path.join(APK_MAIN, 'java', 'com', 'shan', 'card', 'MainActivity.java');
const LAYOUT = path.join(APK_MAIN, 'res', 'layout', 'activity_main.xml');
const MANIFEST = path.join(APK_MAIN, 'AndroidManifest.xml');

/** 网页本体里这些要进 APK。 */
function webFiles() {
  const out = ['index.html', 'app.css'];
  // 递归：js/lang/en.js 这种在子目录里，只 readdir 顶层会漏掉它，
  // 结果就是「词典没同步进 APK」而自检还报全绿。
  function walk(dir) {
    const d = path.join(WEB_ROOT, dir);
    if (!fs.existsSync(d)) return;
    fs.readdirSync(d).forEach(function (f) {
      const rel = dir + '/' + f;
      const st = fs.statSync(path.join(WEB_ROOT, rel));
      if (st.isDirectory()) { walk(rel); return; }
      if (f.slice(-3) === '.js' || f.slice(-5) === '.json') out.push(rel);
    });
  }
  ['js', 'plugins'].forEach(walk);
  return out.sort();
}

// ---------------------------------------------------------------- 断言框架

let pass = 0;
const fails = [];

function ok(cond, label, detail) {
  if (cond) {
    pass++;
  } else {
    fails.push(label + (detail ? ' → ' + detail : ''));
  }
}

function group(title) {
  console.log('\n── ' + title + ' ──');
  return title;
}

function done() {
  console.log('');
  if (fails.length === 0) {
    console.log('✓ APK 壳检查全部通过：' + pass + ' 项');
    process.exit(0);
  }
  console.log('✗ ' + fails.length + ' 项失败 / 共 ' + (pass + fails.length) + ' 项');
  fails.forEach(function (f) { console.log('   - ' + f); });
  process.exit(1);
}

// ---------------------------------------------------------------- A. 资源同步

group('A. 网页副本与本体一致');

if (!fs.existsSync(APK_ROOT)) {
  console.log('找不到 ' + APK_ROOT + '，跳过。');
  process.exit(0);
}

if (SYNC) {
  webFiles().forEach(function (rel) {
    const dst = path.join(APK_WWW, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(path.join(WEB_ROOT, rel), dst);
  });
  console.log('已同步 ' + webFiles().length + ' 个文件 → ' + path.relative(APK_ROOT, APK_WWW));
}

webFiles().forEach(function (rel) {
  const src = path.join(WEB_ROOT, rel);
  const dst = path.join(APK_WWW, rel);
  if (!fs.existsSync(dst)) {
    ok(false, '副本里缺文件', rel);
    return;
  }
  const a = fs.readFileSync(src);
  const b = fs.readFileSync(dst);
  ok(a.equals(b), '副本与本体不一致（改完网页记得 --sync）', rel);
});

// 反向：副本里不该有本体已经没有的旧文件（删掉的 js 会一直被打进包）
(function () {
  const alive = new Set(webFiles());
  (function walk(dir) {
    const d = path.join(APK_WWW, dir);
    if (!fs.existsSync(d)) return;
    fs.readdirSync(d).forEach(function (f) {
      const rel = dir + '/' + f;
      if (fs.statSync(path.join(APK_WWW, rel)).isDirectory()) { walk(rel); return; }
      if (alive.has(rel)) return;
      // 只在两边都可能是「网页源码」时才报，避免误伤
      if (f.slice(-3) === '.js' || f.slice(-5) === '.json') {
        ok(false, '副本里有本体已删除的残留文件', rel);
      }
    });
  })('js');
  (function walk(dir) {
    const d = path.join(APK_WWW, dir);
    if (!fs.existsSync(d)) return;
    fs.readdirSync(d).forEach(function (f) {
      const rel = dir + '/' + f;
      if (fs.statSync(path.join(APK_WWW, rel)).isDirectory()) { walk(rel); return; }
      if (alive.has(rel)) return;
      if (f.slice(-3) === '.js' || f.slice(-5) === '.json') {
        ok(false, '副本里有本体已删除的残留文件', rel);
      }
    });
  })('plugins');
})();

// ---------------------------------------------------------------- B. Java 结构

group('B. MainActivity.java 结构');

const java = fs.readFileSync(JAVA, 'utf8');

// B.1 括号配平（先剥注释和字符串/字符字面量，否则正则和转义会骗人）
function stripJava(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];

    if (c === '/' && n === '*') {           // 块注释
      const end = src.indexOf('*/', i + 2);
      i = end < 0 ? src.length : end + 2;
      out += ' ';
      continue;
    }
    if (c === '/' && n === '/') {           // 行注释
      const end = src.indexOf('\n', i);
      i = end < 0 ? src.length : end;
      out += ' ';
      continue;
    }
    if (c === '"') {                        // 字符串（含 \u0000 之类的转义）
      i++;
      while (i < src.length) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === '"') { i++; break; }
        i++;
      }
      out += '""';
      continue;
    }
    if (c === "'") {                        // 字符字面量
      i++;
      while (i < src.length) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === "'") { i++; break; }
        i++;
      }
      out += "''";
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

const javaStripped = stripJava(java);

['()', '[]', '{}'].forEach(function (pair) {
  const open = pair[0], close = pair[1];
  let depth = 0, bad = false;
  for (let i = 0; i < javaStripped.length; i++) {
    if (javaStripped[i] === open) depth++;
    else if (javaStripped[i] === close) { depth--; if (depth < 0) { bad = true; break; } }
  }
  ok(!bad && depth === 0, '括号不配平 ' + pair, 'depth=' + depth);
});

// 防止 stripJava 把整段代码吃掉（吃掉了就永远配平，检查形同虚设）
ok(/class\s+MainActivity/.test(javaStripped), 'stripJava 后仍能看到 class 声明');
ok((javaStripped.match(/public\s+/g) || []).length >= 5, 'stripJava 后 public 数量看起来正常');

// B.2 JS 桥签名必须和网页侧对得上
(function () {
  const m = java.match(/boolean\s+saveFile\s*\(([^)]*)\)/);
  ok(!!m, '找不到 saveFile 桥方法');
  if (m) {
    const args = m[1].split(',').map(function (s) { return s.trim(); });
    ok(args.length === 3, 'saveFile 应接受 3 个参数', '实际 ' + args.length);
    args.forEach(function (a, i) {
      ok(/\bString\b/.test(a), 'saveFile 第 ' + (i + 1) + ' 个参数应是 String', a);
    });
  }

  const h = java.match(/String\s+httpRequest\s*\(([^)]*)\)/);
  ok(!!h, '找不到 httpRequest 桥方法');
  if (h) {
    const args = h[1].replace(/\s+/g, ' ').split(',').map(function (s) { return s.trim(); });
    ok(args.length === 5, 'httpRequest 应接受 5 个参数', '实际 ' + args.length);
    ok(/String/.test(args[3] || ''), 'httpRequest 第 4 个参数（body）应是 String', args[3]);
    ok(/int/.test(args[4] || ''), 'httpRequest 第 5 个参数（timeoutMs）应是 int', args[4]);
  }

  // 桥的注册名
  const nameMatch = java.match(/addJavascriptInterface\s*\(\s*new\s+\w+\s*\(\s*\)\s*,\s*"([^"]+)"\s*\)/);
  ok(!!nameMatch, '没有注册 JS 桥对象');
  if (nameMatch) {
    const u = fs.readFileSync(path.join(WEB_ROOT, 'js', 'util.js'), 'utf8');
    const a = fs.readFileSync(path.join(WEB_ROOT, 'js', 'ai.js'), 'utf8');
    ok(u.indexOf('global.' + nameMatch[1]) >= 0,
      'util.js 里没有用到这个桥名', nameMatch[1]);
    ok(a.indexOf('global.' + nameMatch[1]) >= 0,
      'ai.js 里没有用到这个桥名', nameMatch[1]);
  }

  // 信封字段两边都在用
  ['ok', 'status', 'body', 'error'].forEach(function (k) {
    ok(java.indexOf('"' + k + '"') >= 0, 'Java 侧没有产出信封字段 ' + k);
  });
  const aiSrc = fs.readFileSync(path.join(WEB_ROOT, 'js', 'ai.js'), 'utf8');
  ['r.ok', 'r.status', 'r.body', 'r.error'].forEach(function (k) {
    ok(aiSrc.indexOf(k) >= 0, 'ai.js 没有读信封字段 ' + k);
  });

  // 超时不能写死，否则网页设置的 timeoutMs 就白给了
  ok(/setReadTimeout\s*\(\s*timeoutMs/.test(java.replace(/\s+/g, ' ')),
    'setReadTimeout 没有用上传入的 timeoutMs');

  // 请求头透传必须跳过这几个，否则 HttpURLConnection 直接抛异常
  ['host', 'content-length', 'connection'].forEach(function (k) {
    ok(new RegExp('"' + k.replace(/-/g, '\\-') + '"').test(java),
      '透传请求头时没有跳过 ' + k);
  });
})();

// B.3 虚拟域名三处必须一致
(function () {
  const host = java.match(/String\s+HOST\s*=\s*"([^"]+)"/);
  ok(!!host, '找不到 HOST 常量');
  if (!host) return;
  ok(java.indexOf('"https://" + HOST') >= 0, 'BASE_URL 不是拼出来的 https 地址');
  ok(/loadUrl\s*\(\s*START_URL\s*\)/.test(java), '没有用 START_URL 启动');
  ok(/START_URL\s*=\s*BASE_URL\s*\+\s*"\/assets\//.test(java.replace(/\s+/g, ' ')),
    'START_URL 没有走 /assets/ 前缀');

  // assets 里的实际路径必须和 START_URL 的 /www/ 段对得上
  ok(fs.existsSync(path.join(APK_WWW, 'index.html')), 'assets/www/index.html 不存在');
  ok(/\/assets\/www\/index\.html"/.test(java), 'START_URL 的 /www/ 段和实际目录对不上');
})();

// B.4 关键 WebView 设置，缺哪个都是「能开但很难用」
[
  ['setJavaScriptEnabled', '没开 JS，整页都是白屏'],
  ['setDomStorageEnabled', '没开 localStorage，牌组/卡片/设置全部存不住'],
  ['setAllowContentAccess', '没开的话导入文件读不到 content:// URI'],
  ['setMixedContentMode', '没放开混合内容，页面是 https 而 Ollama 是 http 会被拦'],
  ['webView.onPause()', '不调 onPause，localStorage 可能不落盘、丢最后一批编辑'],
  ['CookieManager', '没有 flush cookie'],
  ['onShowFileChooser', '没有文件选择器回调，「导入」按钮会没反应'],
  ['onActivityResult', 'onShowFileChooser 的结果没人接，WebView 会一直等'],
].forEach(function (pair) {
  ok(java.indexOf(pair[0]) >= 0, pair[0] + ' —— ' + pair[1]);
});

// onReceivedError 有两个重载：API 23 起框架只调新的那个，而且默认实现**不会**转调旧的，
// 只覆写一个的话，新设备上页面加载失败会完全静默（白屏也没提示）。
ok(/onReceivedError\s*\(\s*WebView\s+\w+\s*,\s*int\s/.test(java),
  '缺少 onReceivedError 的 API 22 及以下重载');
ok(/onReceivedError\s*\(\s*WebView\s+\w+\s*,\s*WebResourceRequest\s/.test(java),
  '缺少 onReceivedError 的 API 23+ 重载');
ok(/import\s+android\.webkit\.WebResourceError\s*;/.test(java),
  '新重载用到了 WebResourceError 但没 import');
// destroy 前的正确姿势：先摘出父容器
ok(/removeView\s*\(\s*webView\s*\)/.test(java),
  'onDestroy 里没有把 WebView 从父容器摘掉');

// B.5 资源引用必须真实存在
(function () {
  const ids = java.match(/R\.id\.(\w+)/g) || [];
  const layouts = java.match(/R\.layout\.(\w+)/g) || [];
  const layoutSrc = fs.readFileSync(LAYOUT, 'utf8');

  ids.forEach(function (ref) {
    const id = ref.split('.')[2];
    ok(new RegExp('@\\+id/' + id + '(?![\\w-])').test(layoutSrc),
      'Java 引用了布局里没有的 id', id);
  });
  ok(ids.length > 0, 'Java 里没有 findViewById，WebView 是怎么来的？');

  layouts.forEach(function (ref) {
    const name = ref.split('.')[2];
    ok(fs.existsSync(path.join(APK_MAIN, 'res', 'layout', name + '.xml')),
      '引用了不存在的布局文件', name);
  });

  // 反向：布局里有 WebView 但 Java 没引用，等于界面是空的
  ok(/<WebView/i.test(layoutSrc), 'activity_main.xml 里没有 WebView');
})();

// ---------------------------------------------------------------- C. 清单与资源

group('C. Manifest 与打包');

const manifest = fs.readFileSync(MANIFEST, 'utf8');

ok(/android\.permission\.INTERNET/.test(manifest), 'Manifest 没有声明 INTERNET 权限');
ok(/WRITE_EXTERNAL_STORAGE/.test(manifest),
  'Manifest 没有声明 WRITE_EXTERNAL_STORAGE（Android 9 及以下导出会落到私有目录）');
ok(/MainActivity/.test(manifest), 'Manifest 里找不到 MainActivity');
ok(/package="com\.shan\.card"/.test(manifest), 'Manifest 的 package 变了');
ok(/com\.shan\.card/.test(java), 'MainActivity 的 package 和 Manifest 对不上');

// index.html 引用的本地资源都得在 assets/www 里
(function () {
  const html = fs.readFileSync(path.join(APK_WWW, 'index.html'), 'utf8');
  const refs = html.match(/(?:src|href)="([^"#:]+?)"/g) || [];
  const seen = new Set();
  refs.forEach(function (r) {
    const m = r.match(/(?:src|href)="([^"#:]+?)"/);
    if (!m) return;
    const rel = m[1];
    if (/^https?:|^data:|^mailto:/.test(rel)) return;
    if (seen.has(rel)) return;
    seen.add(rel);
    ok(fs.existsSync(path.join(APK_WWW, rel)), 'index.html 引用的资源没打进 APK', rel);
  });
  ok(seen.size >= 7, 'index.html 里解析到的本地资源太少，可能正则失效了', seen.size + ' 个');
})();

// minSdk 必须 >= 21（onShowFileChooser 是 API 21 起）
(function () {
  const g = fs.readFileSync(path.join(APK_ROOT, 'app', 'build.gradle'), 'utf8');
  const m = g.match(/minSdkVersion\s+(\d+)/);
  ok(!!m, '在 app/build.gradle 里找不到 minSdkVersion');
  if (m) ok(parseInt(m[1], 10) >= 21, 'minSdk 低于 21，文件选择器用不了', 'minSdk=' + m[1]);
})();

// ---------------------------------------------------------------- D. 主题与 lint 安全

group('D. 主题与 lint 安全');

// 主题里带 ActionBar 的话，网页自己的顶栏上面会再压一条系统标题栏 —— 两层标题栏。
['values/styles.xml', 'values-v21/styles.xml'].forEach(function (rel) {
  const p = path.join(APK_MAIN, 'res', rel);
  if (!fs.existsSync(p)) return ok(false, '主题文件不存在', rel);
  const src = fs.readFileSync(p, 'utf8');
  // 只看 parent 属性，不匹配注释里出现的 DarkActionBar 字样
  ok(!/parent="@android:style\/Theme[^"]*DarkActionBar"/.test(src),
    '主题还是 DarkActionBar，会和网页顶栏叠成两层标题栏', rel);
  ok(/parent="@android:style\/Theme[^"]*NoActionBar"/.test(src), '主题不是 NoActionBar', rel);
  ok(/android:windowBackground/.test(src), '主题没设 windowBackground，冷启动会闪白', rel);
});

// 主题引用了 @color/windowBg，colors.xml 里就必须真的有它，否则 aapt 直接编译失败。
(function () {
  const colors = fs.readFileSync(path.join(APK_MAIN, 'res', 'values', 'colors.xml'), 'utf8');
  const styles = fs.readFileSync(path.join(APK_MAIN, 'res', 'values-v21', 'styles.xml'), 'utf8');
  if (/@color\/windowBg/.test(styles)) {
    ok(/name="windowBg"/.test(colors), '主题引用了 @color/windowBg，colors.xml 里却没定义');
  }
})();

// lint 的 NewApi 不看运行时判断：minSdk 21 的工程引用 API 23/29 的类型，
// 即使调用点写了 SDK_INT 判断，方法体里照样报 Error —— release 跑 lintVitalRelease 就编不过。
ok(/import\s+android\.annotation\.TargetApi\s*;/.test(java),
  '没有 import android.annotation.TargetApi（release 的 lint 会拦 API 29/23 的用法）');
[
  ['saveViaMediaStore', /@TargetApi\s*\(\s*Build\.VERSION_CODES\.Q\s*\)[\s\S]{0,400}?private\s+boolean\s+saveViaMediaStore/,
    'saveViaMediaStore 缺 @TargetApi(Q)'],
  ['onReceivedError(WebResourceError)', /@TargetApi\s*\(\s*Build\.VERSION_CODES\.M\s*\)[\s\S]{0,600}?onReceivedError\s*\(\s*WebView\s+\w+\s*,\s*WebResourceRequest/,
    'onReceivedError(WebResourceRequest, WebResourceError) 缺 @TargetApi(M)']
].forEach(function (t) {
  ok(t[1].test(java), t[2]);
});

// 缺少的 assets 不能 return null（那会让 WebView 真的去网络上请求虚拟域名，报 DNS 错误）
(function () {
  const i = java.indexOf('public WebResourceResponse shouldInterceptRequest');
  const seg = java.slice(i, i + 1400);
  ok(!/catch\s*\([^)]*\)\s*\{[^}]*return\s+null\s*;/.test(seg),
    'shouldInterceptRequest 找不到文件时 return null 了，应该回 404');
  ok(/404/.test(seg) && /Not Found/.test(seg), 'shouldInterceptRequest 没有回 404');
  ok(/isTextMime\s*\(\s*mime\s*\)/.test(seg), '二进制资源没有再区分编码，png 会被当成 utf-8');
})();

// 非白名单 scheme 不该丢给系统（about:blank、javascript:、blob: 交给 startActivity 只会抛异常）
(function () {
  const i = java.indexOf('private boolean handleUrl');
  const seg = java.slice(i, i + 900);
  ok(/"mailto:"/.test(seg) && /"tel:"/.test(seg), 'handleUrl 没有 scheme 白名单');
})();

// 本机没有 aapt，XML 写坏了要到打包那一刻才知道。这里自己做一遍（去注释后的）标签配平，
// 至少能抓到「少写一个 </item>」这类低级但致命的错误。
(function () {
  const xmls = [
    'AndroidManifest.xml',
    'res/layout/activity_main.xml',
    'res/values/styles.xml',
    'res/values-v21/styles.xml',
    'res/values/colors.xml',
    'res/values/strings.xml'
  ];
  xmls.forEach(function (rel) {
    const p = path.join(APK_MAIN, rel);
    if (!fs.existsSync(p)) return ok(false, 'XML 文件不存在', rel);
    const src = fs.readFileSync(p, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    const stack = [];
    const re = /<(\/?)([A-Za-z][\w:.-]*)([^>]*?)(\/?)>/g;
    let m, err = null;
    while ((m = re.exec(src))) {
      if (m[1]) {
        const top = stack.pop();
        if (top !== m[2]) { err = '闭合不匹配 </' + m[2] + '>，期望 </' + top + '>'; break; }
      } else if (!m[4]) {
        stack.push(m[2]);
      }
    }
    if (!err && stack.length) err = '未闭合: ' + stack.join(', ');
    ok(!err, 'XML 标签不配平', rel + ' —— ' + err);
  });
})();

// 一旦有人把 release 的 minifyEnabled 打开，没有这两条 keep 规则，
// R8 会把 @JavascriptInterface 的方法改名/删掉，网页侧调用直接变成 not a function。
(function () {
  const p = path.join(APK_ROOT, 'app', 'proguard-rules.pro');
  if (!fs.existsSync(p)) return ok(false, 'proguard-rules.pro 不存在');
  const src = fs.readFileSync(p, 'utf8');
  ok(/@android\.webkit\.JavascriptInterface/.test(src),
    'proguard 没保留 @JavascriptInterface 方法，开混淆后 JS 桥会失效');
  ok(/-keep\s+class\s+com\.shan\.card\.MainActivity\$NativeBridge/.test(src),
    'proguard 没保留 MainActivity$NativeBridge');
})();

// AGP 版本和 Gradle 版本必须同大版本，否则新版 Android Studio（自带 Gradle 8.x）
// 直接构建会失败。这里从根 build.gradle 读 AGP 版本，再去对 wrapper 的 Gradle 版本。
(function () {
  const root = fs.readFileSync(path.join(APK_ROOT, 'build.gradle'), 'utf8');
  const agp = root.match(/build_gradle_version\s*=\s*['"]([\d.]+)['"]/);
  ok(!!agp, '在根 build.gradle 里找不到 build_gradle_version');
  const agpMajor = agp ? agp[1].split('.')[0] : null;

  const wp = path.join(APK_ROOT, 'gradle', 'wrapper', 'gradle-wrapper.properties');
  if (!fs.existsSync(wp)) {
    return ok(false, '缺 gradle/wrapper/gradle-wrapper.properties —— gradlew 启动不了（缺 jar），'
      + 'IDE 也会用自带 Gradle 版本，可能和 AGP 不兼容');
  }
  const src = fs.readFileSync(wp, 'utf8');
  const g = src.match(/distributionUrl=.*gradle-(\d+)[.\d]*-bin\.zip/);
  ok(!!g, 'gradle-wrapper.properties 里没有可识别的 distributionUrl');
  if (g && agpMajor) {
    ok(g[1] === agpMajor,
      'Gradle 大版本和 AGP 大版本不一致，构建会失败', 'Gradle ' + g[1] + '.x vs AGP ' + agp[1]);
  }
  ok(/gradle-7\.\d/.test(src), 'Gradle 没钉在 7.x（AGP 7.0.2 不兼容 Gradle 8）');
})();

done();
