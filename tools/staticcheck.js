/* ============================================================
 * tools/staticcheck.js —— 离线静态一致性检查（Node 运行，不进 APK）
 *
 *   node tools/staticcheck.js
 *
 * selftest.js 跑的是「运行时逻辑」，这个脚本查的是「接缝」：
 *   1) 跨模块调用（U.xxx / Cloze.xxx / Plugins.xxx / DB.xxx / AI.xxx）
 *      引用的成员是否真的存在于对方的导出表里 —— 拼错名字最常在这里翻车；
 *   2) app.js 里 $('#xxx') / getElementById('xxx') 用到的 id，
 *      是否在 index.html 或 app.js 自己的模板里被定义过；
 *   3) 各 js 文件里挂在 window 上的全局名是否和调用方一致。
 * ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const SRC_DIRS = ['js'];
const ALL = ['index.html', 'js/util.js', 'js/i18n.js', 'js/lang/en.js', 'js/cloze.js', 'js/plugins.js', 'js/store.js', 'js/ai.js', 'js/app.js'];

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, extra) {
  if (cond) pass++; else { fail++; failures.push(name + (extra ? `  → ${extra}` : '')); }
}
function eq(name, got, want) {
  ok(name, JSON.stringify(got) === JSON.stringify(want), `得到 ${JSON.stringify(got)}，期望 ${JSON.stringify(want)}`);
}
function group(t) { console.log(`\n── ${t} ──`); }

/* ---------------- 1. 读出各模块的导出表 ---------------- */
function makeStore() {
  const m = new Map();
  return { getItem: (k) => (m.has(String(k)) ? m.get(String(k)) : null),
           setItem: (k, v) => m.set(String(k), String(v)),
           removeItem: (k) => m.delete(String(k)), clear: () => m.clear(),
           key: (i) => Array.from(m.keys())[i] ?? null, get length() { return m.size; } };
}
function fakeEl() {
  const e = { style: {}, dataset: {}, children: [], classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    innerHTML: '', textContent: '', value: '', checked: false, disabled: false,
    setAttribute() {}, getAttribute: () => null, removeAttribute() {},
    appendChild(c) { this.children.push(c); return c; }, removeChild() {}, remove() {}, insertBefore() {},
    addEventListener() {}, removeEventListener() {}, querySelector: () => null, querySelectorAll: () => [],
    focus() {}, blur() {}, click() {}, select() {}, scrollIntoView() {},
    getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 }),
    cloneNode() { return fakeEl(); } };
  return e;
}
const doc = { readyState: 'complete', body: fakeEl(), documentElement: fakeEl(), head: fakeEl(),
  createElement: () => fakeEl(), createTextNode: () => ({}), createDocumentFragment: () => fakeEl(),
  getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  addEventListener() {}, removeEventListener() {}, execCommand: () => true, cookie: '' };

const sb = {
  console, setTimeout, clearTimeout, setInterval, clearInterval,
  Promise, Date, Math, JSON, Object, Array, String, Number, Boolean, RegExp, Error, TypeError,
  Map, Set, WeakMap, WeakSet, Symbol, Intl, encodeURIComponent, decodeURIComponent,
  isNaN, isFinite, parseInt, parseFloat,
  atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  URL: globalThis.URL, TextEncoder: globalThis.TextEncoder, TextDecoder: globalThis.TextDecoder,
  AbortController: globalThis.AbortController, fetch: globalThis.fetch,
  navigator: { language: 'zh-CN', userAgent: 'node', onLine: true },
  location: { href: 'https://x/y', protocol: 'https:', origin: 'https://x', reload() {} },
  localStorage: makeStore(), sessionStorage: makeStore(), document: doc,
  alert() {}, confirm: () => false, prompt: () => null,
  getComputedStyle: () => ({ getPropertyValue: () => '' }),
  matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
  requestAnimationFrame: (cb) => setTimeout(cb, 0), cancelAnimationFrame: (id) => clearTimeout(id),
  addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
};
sb.window = sb; sb.globalThis = sb; sb.self = sb;
sb.FileReader = class { readAsText() {} };
sb.Blob = class {};
const ctx = vm.createContext(sb);

group('加载逻辑模块');
// i18n 必须最先（plugins.js 在顶层就取 global.I18n.T），en.js 紧随其后（调用 I18n.register）
const LOAD = ['js/i18n.js', 'js/lang/en.js', 'js/util.js', 'js/cloze.js', 'js/plugins.js', 'js/store.js', 'js/ai.js'];
for (const rel of LOAD) {
  try { vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: rel }); ok(`加载 ${rel}`, true); }
  catch (e) { ok(`加载 ${rel}`, false, e.message); }
}

const EXPORTS = {
  U: ctx.U, Cloze: ctx.Cloze, Plugins: ctx.Plugins, DB: ctx.DB, AI: ctx.AI,
};
const EXPORT_KEYS = {};
for (const [n, o] of Object.entries(EXPORTS)) {
  EXPORT_KEYS[n] = o ? new Set(Object.keys(o)) : new Set();
  ok(`global.${n} 已导出`, !!o);
}
// _seg 之类的内部缓存不该被外部调用；模块间互相引用的名字必须真实存在
ok('U 导出表非空', EXPORT_KEYS.U.size > 20, `size=${EXPORT_KEYS.U.size}`);
ok('Cloze 导出表非空', EXPORT_KEYS.Cloze.size > 10, `size=${EXPORT_KEYS.Cloze.size}`);
ok('Plugins 导出表非空', EXPORT_KEYS.Plugins.size > 10, `size=${EXPORT_KEYS.Plugins.size}`);
ok('DB 导出表非空', EXPORT_KEYS.DB.size > 20, `size=${EXPORT_KEYS.DB.size}`);
ok('AI 导出表非空', EXPORT_KEYS.AI.size > 5, `size=${EXPORT_KEYS.AI.size}`);

/* ---------------- 2. 扫描跨模块成员引用 ---------------- */
group('跨模块调用拼写');
const files = [];
SRC_DIRS.forEach((d) => fs.readdirSync(path.join(ROOT, d)).filter((f) => f.endsWith('.js'))
  .forEach((f) => files.push(path.join(d, f))));

let refCount = 0;
const unknown = [];
for (const rel of files) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  // 去掉注释和字符串里明显不是调用的部分：直接正则扫 `Name.member`
  const re = /\b(U|Cloze|Plugins|DB|AI)\.([A-Za-z_$][A-Za-z0-9_$]*)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const mod = m[1], member = m[2];
    // 跳过对象字面量里 `DB: DB` 之类的键名场景（前面紧跟 { 或 ,）
    const before = src.slice(Math.max(0, m.index - 12), m.index);
    if (/[{,]\s*$/.test(before)) continue;
    refCount++;
    if (!EXPORT_KEYS[mod].has(member)) {
      const line = src.slice(0, m.index).split('\n').length;
      unknown.push(`${rel}:${line}  ${mod}.${member}`);
    }
  }
}
ok('扫到了足够多的跨模块引用', refCount > 100, `只扫到 ${refCount} 处`);
ok('没有引用不存在的导出成员', unknown.length === 0, '\n      ' + unknown.join('\n      '));

/* ---------------- 3. 内部 helper 调用（同文件内的未定义标识符） ---------------- */
group('同文件内函数调用完整性');

/** 去掉注释与字符串/模板/正则字面量，避免把 color:var(--fg)、rgba(...) 当成函数调用 */
function stripLiterals(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  // 上一个有意义字符，用来区分 `/` 是除法还是正则开头
  let prev = '';
  const REGEX_PREV = new Set(['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '~', '^', '<', '>', '\n']);
  while (i < n) {
    const c = src[i], c2 = src[i + 1];
    if (c === '/' && c2 === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && c2 === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    // Kotlin 原始字符串 """..."""（里面可以出现单个引号和反斜杠，必须先于普通引号处理）
    if (c === '"' && c2 === '"' && src[i + 2] === '"') {
      i += 3;
      while (i < n && !(src[i] === '"' && src[i + 1] === '"' && src[i + 2] === '"')) i++;
      i += 3;
      out += '""'; prev = '"'; continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; i++;
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === q) { i++; break; }
        i++;
      }
      out += '""'; prev = '"'; continue;
    }
    // 正则字面量：/.../<flags>。不识别的话，正则里出现的引号会把后面半张文件吃掉。
    if (c === '/' && REGEX_PREV.has(prev)) {
      i++;
      let inClass = false;
      while (i < n) {
        const d = src[i];
        if (d === '\\') { i += 2; continue; }
        if (d === '[') inClass = true;
        else if (d === ']') inClass = false;
        else if (d === '/' && !inClass) { i++; break; }
        else if (d === '\n') break; // 不是正则，别把文件吃了
        i++;
      }
      while (i < n && /[a-z]/.test(src[i])) i++; // flags
      out += 'RE'; prev = 'E'; continue;
    }
    out += c;
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return out;
}

/** 收集本文件声明的所有标识符：function 名、var/let/const 的每个声明名、函数形参 */
function collectDefined(src) {
  const set = new Set();
  let m;
  const fnRe = /function\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;
  while ((m = fnRe.exec(src)) !== null) set.add(m[1]);
  // 逐个声明语句，把 `a = 1, b, c = 2` 全部拆出来
  const declRe = /\b(?:var|let|const)\s+([^;]+)/g;
  while ((m = declRe.exec(src)) !== null) {
    m[1].split(',').forEach((part) => {
      const name = part.split('=')[0].trim().replace(/[[\]{}].*$/, '').trim();
      const id = /^([A-Za-z_$][A-Za-z0-9_$]*)/.exec(name);
      if (id) set.add(id[1]);
    });
  }
  // 形参：`function f(a, b, c)` 以及 `function (a, b)`
  const paramRe = /function\s*[A-Za-z0-9_$]*\s*\(([^)]*)\)/g;
  while ((m = paramRe.exec(src)) !== null) {
    m[1].split(',').forEach((p) => {
      const id = /^\s*([A-Za-z_$][A-Za-z0-9_$]*)/.exec(p);
      if (id) set.add(id[1]);
    });
  }
  return set;
}

const BUILTIN = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'typeof',
  'String', 'Number', 'Boolean', 'Object', 'Array', 'JSON', 'Math', 'Date', 'RegExp', 'Error',
  'TypeError', 'RangeError', 'parseInt', 'parseFloat', 'isNaN', 'isFinite',
  'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame',
  'Promise', 'Set', 'Map', 'WeakMap', 'Symbol', 'Proxy', 'Reflect',
  'require', 'console', 'await', 'new', 'do', 'else', 'try', 'delete', 'void', 'in', 'of', 'yield',
  // 宿主环境提供的全局
  'fetch', 'AbortController', 'Blob', 'FileReader', 'File', 'URL', 'Intl', 'atob', 'btoa',
  'resolve', 'reject', 'executor', 'then', 'catch', 'finally', 'call', 'apply', 'bind']);

for (const rel of files) {
  const raw = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const src = stripLiterals(raw);
  // 声明名从「原文」里收集（更保险，字符串里出现 function foo( 的概率极低）；
  // 调用从「去字面量后的文本」里收集，避免 CSS/正则误报。
  const defined = collectDefined(raw);
  const callRe = /(?<![.\w$])([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g;
  const missing = new Set();
  let m;
  while ((m = callRe.exec(src)) !== null) {
    const name = m[1];
    if (BUILTIN.has(name) || defined.has(name)) continue;
    missing.add(name);
  }
  ok(`${rel} 没有调用未定义的本地函数`, missing.size === 0, [...missing].join(', '));
}
// 反向校验：stripLiterals 不能把整段代码吃掉（吃掉了就会漏报真正的未定义调用）
for (const rel of files) {
  const raw = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const stripped = stripLiterals(raw);
  ok(`${rel} 去字面量后仍保留函数定义`, /function\s+[A-Za-z_$]/.test(stripped),
    `剥掉 ${raw.length - stripped.length} 字符后找不到 function 关键字`);
}

/* ---------------- 4. DOM id 一致性 ---------------- */
group('DOM id 一致性');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const appSrc = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
const allUiSrc = [html].concat(files.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8'))).join('\n');

// 所有被「定义」的 id：静态 html + 模板字符串里的 id="xxx"
const definedIds = new Set();
let m;
const idDefRe = /\bid\s*=\s*["'`]([A-Za-z_][A-Za-z0-9_\-]*)["'`]/g;
while ((m = idDefRe.exec(allUiSrc)) !== null) definedIds.add(m[1]);
ok('收集到了若干 id 定义', definedIds.size > 30, `只找到 ${definedIds.size} 个`);

// 所有被「查询」的 id
const queried = new Set();
const qRes = [/\$\('#([A-Za-z0-9_\-]+)'\)/g, /getElementById\(\s*'([A-Za-z0-9_\-]+)'\s*\)/g,
  /querySelector\(\s*'#([A-Za-z0-9_\-]+)'/g];
for (const qre of qRes) {
  while ((m = qre.exec(allUiSrc)) !== null) queried.add(m[1]);
}
ok('收集到了若干 id 查询', queried.size > 10, `只找到 ${queried.size} 个`);

const dangling = [...queried].filter((id) => !definedIds.has(id));
ok('查询的每个 id 都有对应定义', dangling.length === 0, dangling.join(', '));

// API Key 输入框必须是明文 text：掩码不提供任何安全性（值本来就明文存在 localStorage 里），
// 却让核对 Key 变难，还会在 WebView 里触发系统密码管理器自动填充、弹窗挡视线。
// 这条规则是为了防止哪天「顺手上个 password 更安全」又改回去。
const keyInput = /<input[^>]*id="set-key"[^>]*>/.exec(allUiSrc);
ok('找得到 API Key 输入框 #set-key', !!keyInput, '没找到，模板可能改名了');
if (keyInput) {
  ok('API Key 输入框不是 type="password"', !/type="password"/.test(keyInput[0]),
    'Key 框被掩码了，与「不用自动隐藏」的要求相反');
  ok('API Key 输入框显式声明 type="text"', /type="text"/.test(keyInput[0]));
  ok('API Key 输入框关掉了自动补全 / 自动大写 / 自动纠错',
    /autocomplete="off"/.test(keyInput[0]) && /autocapitalize="off"/.test(keyInput[0]) &&
    /autocorrect="off"/.test(keyInput[0]),
    '移动端输入法可能把 Key 首字母大写或自动纠正');
}
const anyPassword = /type\s*=\s*["']password["']/.test(allUiSrc);
ok('全项目没有任何 password 输入框（含插件模板）', !anyPassword,
  '还有 password 输入框：' + (allUiSrc.match(/.{0,60}type="password".{0,60}/) || [''])[0]);

/* ---------------- 5. index.html 资源与全局名 ---------------- */
group('资源与全局名');
for (const rel of LOAD.concat(['js/app.js', 'app.css'])) {
  ok(`index.html 引用了 ${rel}`, html.includes(rel), '没找到');
}
for (const rel of LOAD.concat(['js/app.js'])) {
  ok(`文件存在 ${rel}`, fs.existsSync(path.join(ROOT, rel)));
}
// 脚本顺序：直接读 index.html 的真实顺序，而不是假设一个顺序。
// util.js 必须最先（所有模块都依赖 U），app.js 必须最后（依赖前面全部）。
const order = ['js/i18n.js', 'js/lang/en.js', 'js/util.js', 'js/store.js', 'js/cloze.js', 'js/plugins.js', 'js/ai.js', 'js/app.js'];
const htmlOrder = [];
{
  const re = /<script\s+src="([^"]+)"/g;
  let mm;
  while ((mm = re.exec(html)) !== null) htmlOrder.push(mm[1]);
}
ok('index.html 按顺序引用了全部 8 个脚本', htmlOrder.length === 8, JSON.stringify(htmlOrder));
eq('i18n.js 在最前（util.js 与 plugins.js 加载时就要取 I18n.T）', htmlOrder[0], 'js/i18n.js');
eq('en.js 紧跟 i18n.js（它调用 I18n.register）', htmlOrder[1], 'js/lang/en.js');
eq('util.js 排第三（其余模块依赖 U，但 U 自己也要用 I18n.T）', htmlOrder[2], 'js/util.js');
eq('app.js 在最后（依赖前面全部）', htmlOrder[htmlOrder.length - 1], 'js/app.js');
ok('index.html 的顺序与 LOAD 集合一致',
  JSON.stringify(htmlOrder.slice().sort()) === JSON.stringify(order.slice().sort()),
  JSON.stringify(htmlOrder));
// 事实检验：按 html 的顺序真的能加载成功（比顺序断言更硬）
{
  const sb2 = Object.assign({}, sb);
  sb2.window = sb2; sb2.globalThis = sb2; sb2.self = sb2;
  const ctx2 = vm.createContext(sb2);
  let ok2 = true, err = '';
  for (const rel of htmlOrder) {
    if (rel === 'js/app.js') continue; // app.js 需要真实 DOM
    try { vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx2, { filename: rel }); }
    catch (e) { ok2 = false; err = `${rel}: ${e.message}`; break; }
  }
  ok('按 index.html 的顺序可顺利加载（无依赖倒置）', ok2, err);
  ok('按 html 顺序加载后 6 个全局都到位',
    ok2 && !!(ctx2.U && ctx2.I18n && ctx2.Cloze && ctx2.Plugins && ctx2.DB && ctx2.AI));
}

// 每个模块挂的全局名，必须和 app.js 里用的一致
const GLOBALNAME = { 'js/util.js': 'U', 'js/i18n.js': 'I18n', 'js/cloze.js': 'Cloze', 'js/plugins.js': 'Plugins', 'js/store.js': 'DB', 'js/ai.js': 'AI' };
for (const [rel, name] of Object.entries(GLOBALNAME)) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  ok(`${rel} 挂载 global.${name}`, new RegExp(`global\\.${name}\\s*=`).test(src), '没找到挂载语句');
}

/* ---------------- 6. Android 侧接缝 ---------------- */
group('Android 接缝');
const gradle = fs.readFileSync(path.join(ROOT, 'android/app/build.gradle.kts'), 'utf8');
for (const p of ['index.html', 'app.css', 'js/**', 'plugins/**']) {
  ok(`assets 同步规则包含 ${p}`, gradle.includes(`"${p}"`), '缺');
}
ok('用 Sync 任务同步网页资源', gradle.includes('Sync::class'));
ok('assets 目录挂进 sourceSets', gradle.includes('sourceSets["main"].assets'));
const ktPath = path.join(ROOT, 'android/app/src/main/java/com/example/flashcards/MainActivity.kt');
const kt = fs.readFileSync(ktPath, 'utf8');
ok('用 WebViewAssetLoader 映射（不靠 file://）', kt.includes('WebViewAssetLoader') && kt.includes('addPathHandler'));
ok('起始 URL = assets/www/index.html', kt.includes('/assets/www/index.html'), '对不上');
ok('domStorageEnabled = true（localStorage 必需）', kt.includes('domStorageEnabled = true'));
ok('allowContentAccess = true（文件导入需要）', kt.includes('allowContentAccess = true'));
ok('非本站导航被拦截', /startsWith\(BASE_URL\)/.test(kt));
const manifest = fs.readFileSync(path.join(ROOT, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
ok('Manifest 声明了 INTERNET 权限', manifest.includes('android.permission.INTERNET'));
ok('Manifest 的图标是 @mipmap/ic_launcher', manifest.includes('android:icon="@mipmap/ic_launcher"'));
ok('Manifest 的主题是 @style/Theme.FlashCards', manifest.includes('@style/Theme.FlashCards'));
// 图标与主题资源真实存在
ok('存在 values/themes.xml', fs.existsSync(path.join(ROOT, 'android/app/src/main/res/values/themes.xml')));
ok('存在 mipmap/ic_launcher.xml（API 24/25 回退）', fs.existsSync(path.join(ROOT, 'android/app/src/main/res/mipmap/ic_launcher.xml')));
ok('存在 mipmap-anydpi-v26/ic_launcher.xml（自适应图标）', fs.existsSync(path.join(ROOT, 'android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml')));
ok('存在 values/strings.xml', fs.existsSync(path.join(ROOT, 'android/app/src/main/res/values/strings.xml')));

/* ---------------- 7. Kotlin 同一行两条语句（没法编译 Kotlin，只能结构自检） ---------------- */
group('Kotlin 结构');

/**
 * 扫描 .kt 源码，找“一行里在同一缩进层级塞了两条语句”的地方。
 * 这类错误是最容易被手改引进来的（曾把 `configureSettings()` 和
 * `webView.addJavascriptInterface(...)` 挤成一行），而 Kotlin 里
 * 语句之间必须有换行或分号，编译器会直接报错。
 * 判据：某行的括号深度回到行首深度之后，后面还跟着「2 个以上空格 + 新的标识符」。
 */
function ktStatementBreaks(src) {
  const bad = [];
  let depth = 0;
  let inBlockComment = false;
  src.split('\n').forEach((raw, idx) => {
    let line = raw;
    if (inBlockComment) {
      const end = line.indexOf('*/');
      if (end === -1) return;
      line = line.slice(end + 2);
      inBlockComment = false;
    }
    // 去字符串与注释（保留引号占位，避免 "http://..." 被当成行注释）
    let out = '';
    for (let i = 0; i < line.length; i++) {
      const c = line[i], c2 = line[i + 1];
      if (c === '/' && c2 === '/') break;
      if (c === '/' && c2 === '*') {
        const e = line.indexOf('*/', i + 2);
        if (e === -1) { inBlockComment = true; break; }
        i = e + 1;
        continue;
      }
      if (c === '"') {
        i++;
        while (i < line.length) {
          if (line[i] === '\\') { i += 2; continue; }
          if (line[i] === '"') break;
          i++;
        }
        out += '""';
        continue;
      }
      out += c;
    }
    const startDepth = depth;
    let cut = -1;
    for (let i = 0; i < out.length; i++) {
      const c = out[i];
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') {
        depth--;
        // 取「第一次」回到行首深度的位置：一条合法的单语句行后面通常只会
        // 再有 `{`、`?.`、运算符等；若那之后还有 2+ 空格 + 标识符，基本就是两条语句。
        if (depth === startDepth && c !== '}' && cut < 0) cut = i;
      }
    }
    if (cut < 0) return;
    const m = /^(\s{2,})(\S.*)$/.exec(out.slice(cut + 1));
    if (!m) return;
    const tail = m[2];
    // 合法的续行/块尾：方法链、lambda、逗号、运算符、else/catch 等
    if (/^([.?]|\{|,|\)|\]|:|else\b|catch\b|finally\b|while\b|&&|\|\||\+|-|\*|\/|[=!<>]=?)/.test(tail)) return;
    bad.push(`MainActivity.kt:${idx + 1} 疑似同一行两条语句 → ${tail.slice(0, 60)}`);
  });
  return bad;
}

const ktBreaks = ktStatementBreaks(kt);
ok('MainActivity.kt 没有一行两条语句', ktBreaks.length === 0, ktBreaks.join('\n      '));
ok('MainActivity.kt 括号配平', (() => {
  const s = stripLiterals(kt);
  let d = 0;
  for (const c of s) {
    if ('([{'.includes(c)) d++;
    else if (')]}'.includes(c)) d--;
    if (d < 0) return false;
  }
  return d === 0;
})());
// JS 桥的名字与签名必须和 util.js 的调用方一字不差，否则保存备份会静默失效
const utilSrc = fs.readFileSync(path.join(ROOT, 'js/util.js'), 'utf8');
const jsBridge = /global\.FlashCardsNative/.test(utilSrc);
ok('util.js 通过 global.FlashCardsNative 调桥', jsBridge);
ok('桥对象名一致（FlashCardsNative）', kt.includes('"FlashCardsNative"'));
const ktSave = /fun saveFile\((\w+): String, (\w+): String, (\w+): String\)/.exec(kt);
ok('Kotlin 侧 saveFile(name, text, mime) 三参均为 String', !!ktSave, ktSave ? '' : '签名对不上');
const jsSave = /N\.saveFile\(\s*(\w+)\s*,\s*String\((\w+)\)\s*,\s*([^)]+)\)/.exec(utilSrc);
ok('JS 侧按 (filename, text, mime) 顺序传参', !!jsSave, jsSave ? '' : '调用形态对不上');
ok('桥返回布尔值（JS 靠它决定是否回落 blob 下载）', /fun saveFile\([^)]*\): Boolean/.test(kt));

// 第二个桥：AI 请求走原生代发，绕开 WebView 的 CORS
const aiSrc = fs.readFileSync(path.join(ROOT, 'js/ai.js'), 'utf8');
ok('ai.js 在发请求前探测 FlashCardsNative.httpRequest 桥', /typeof\s+nat\.httpRequest\s*===\s*'function'/.test(aiSrc));
const ktHttp = /fun httpRequest\(([^)]*)\):\s*String/.exec(kt);
ok('Kotlin 侧 httpRequest 存在且返回 String（JSON 信封）', !!ktHttp, ktHttp ? '' : '签名对不上');
if (ktHttp) {
  const args = ktHttp[1].split(',').map(s => s.trim());
  ok('httpRequest 五个参数（url/method/headersJson/body/timeoutMs）', args.length === 5,
    `实际 ${args.length} 个：${args.join(' | ')}`);
  ok('timeoutMs 是 Int（JS 传数字过来）', /\btimeoutMs:\s*Int\b/.test(ktHttp[1]),
    '若不是 Int，Kotlin JS 桥会把数字退化成字符串/报错');
  ok('body 可空（GET 类请求没有 body）', /\bbody:\s*String\?/.test(ktHttp[1]),
    'body 不是可空类型');
}
const jsHttpCall = /nat\.httpRequest\(\s*([^;]+?)\)\s*;/s.exec(aiSrc);
ok('JS 侧按 (url, method, headersJson, body, timeoutMs) 顺序传参', !!jsHttpCall,
  jsHttpCall ? '' : '调用形态对不上');
if (jsHttpCall) {
  const n = jsHttpCall[1].split(',').length;
  ok('JS 实参也是 5 个', n === 5, `实际 ${n} 个`);
}
// 信封字段是 JS 与 Kotlin 的私有约定，改一边就静默坏掉
for (const f of ['ok', 'status', 'body', 'error']) {
  ok(`信封字段「${f}」两边都在用`,
    new RegExp(`put\\("${f}"`).test(kt) && new RegExp(`r\\.${f}|r\\.${f}\\b`).test(aiSrc),
    'Kotlin 或 JS 有一侧没用这个字段名');
}
ok('原生请求带回 HTTP 状态码（JS 靠它判断 400 重试）', /\.put\("status",\s*status\)/.test(kt));
ok('原生失败时返回 ok:false 而不是抛异常穿过桥', /fun errJson\(/.test(kt));
ok('HttpURLConnection 设置 readTimeout（否则网络挂起会永久卡住 UI）', /readTimeout\s*=/.test(kt));
ok('透传请求头时跳过 Host/Content-Length（手填会被 HttpURLConnection 拒绝）',
  /content-length/i.test(kt) && /host/i.test(kt));

/* ---------------- 7. 文档里的相对链接必须真实存在 ---------------- */
group('文档一致性');
const DOCS = ['README.md', '插件开发文档.md', 'android/README-打包.md'];
const MD_LINK = /\[[^\]]*\]\(([^)]+)\)/g;
for (const doc of DOCS) {
  const p = path.join(ROOT, doc);
  if (!fs.existsSync(p)) {
    ok(`${doc} 存在`, false, '文件不存在');
    continue;
  }
  const text = fs.readFileSync(p, 'utf8');
  const broken = [];
  const outside = [];
  let m;
  while ((m = MD_LINK.exec(text)) !== null) {
    let target = m[1].trim();
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    target = target.split('#')[0].split('?')[0];
    if (!target) continue;
    const abs = path.resolve(path.dirname(p), decodeURI(target));
    if (fs.existsSync(abs)) continue;
    // 指向项目目录【外面】的兄弟目录（../xxx）单独算：项目管不到兄弟目录，
    // 它可以被随时移动/删除（`闪卡/` 工程就真的被移走过一次）。
    // 这类断了只提示、不算失败，但下面会原样打出来，不会被藏掉。
    if (target.startsWith('..')) outside.push(m[1]);
    else broken.push(`${m[1]} → 不存在`);
  }
  ok(`${doc} 里的相对链接都指向真实文件`, broken.length === 0, broken.join('; '));
  if (outside.length) {
    console.log(`  ⚠ ${doc} 有 ${outside.length} 个链接指向项目外的兄弟目录，现在不存在：${outside.join('、')}`);
    console.log('    （兄弟目录被移走/删除过。若是有意为之，请同步删掉文档里对应的段落。）');
  }
}
// README 承诺的自检入口必须真的在
for (const t of ['tools/selftest.js', 'tools/staticcheck.js']) {
  ok(`${t} 存在`, fs.existsSync(path.join(ROOT, t)));
}
ok('android/README-打包.md 说明了缺少 gradlew',
  /gradlew/.test(fs.readFileSync(path.join(ROOT, 'android/README-打包.md'), 'utf8')));
// 文档里不应该再出现已经改掉的旧说法
const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
ok('README 不再声称导出走 DownloadManager',
  !/导出文件走\s*`?DownloadListener`?\s*\+\s*`?DownloadManager`?/.test(readme),
  '旧说法还在，和 MainActivity 的 MediaStore 实现不符');

/** 只去注释、保留字符串（data-act="x" 本身就在字符串里，不能一起去掉） */
function stripComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  // 必须同时认得正则字面量：/[\\/:*?"<>|]/ 里那个 " 会把后面半张文件
  // 当成一个巨型字符串，注释就再也删不掉了。
  let prev = '';
  const REGEX_PREV = new Set(['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '~', '^', '<', '>', '\n']);
  while (i < n) {
    const c = src[i], c2 = src[i + 1];
    if (c === '/' && c2 === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && c2 === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '/' && REGEX_PREV.has(prev)) {
      out += 'RE';
      i++;
      let inClass = false;
      while (i < n) {
        const d = src[i];
        if (d === '\\') { i += 2; continue; }
        if (d === '[') inClass = true;
        else if (d === ']') inClass = false;
        else if (d === '/' && !inClass) { i++; break; }
        else if (d === '\n') break;
        i++;
      }
      while (i < n && /[a-z]/.test(src[i])) i++;
      prev = 'E';
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      out += c;
      i++;
      while (i < n) {
        out += src[i];
        if (src[i] === '\\') { i++; if (i < n) out += src[i]; i++; continue; }
        if (src[i] === q) { i++; break; }
        i++;
      }
      prev = q;
      continue;
    }
    out += c;
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return out;
}

/* ---------------- 8. 事件分发闭环：data-act / id 都要有人接 ---------------- */
group('事件分发');

// 先去掉注释：文档注释里举例写的 data-act="..." 会被正则当成真按钮
const appCode = stripComments(appSrc);
//     这个项目有两套分发：全局 onClick 的 switch(data-act)，
//     以及弹窗自己挂的 modal.addEventListener('click') 里 if (act === '...')。
//     两边都不认，点了就是没反应。
const acts = [...new Set([...appCode.matchAll(/data-act="([^"]+)"/g)].map((m) => m[1]))];
const globalCases = new Set([...appSrc.matchAll(/case '([^']+)'/g)].map((m) => m[1]));
const localCases = new Set(
  [...appSrc.matchAll(/act\s*[!=]==?\s*'([^']+)'/g)].map((m) => m[1])
);
const deadActs = acts.filter((a) => !globalCases.has(a) && !localCases.has(a));
ok(`全部 ${acts.length} 个 data-act 都有处理分支`, deadActs.length === 0,
  deadActs.map((a) => `${a}（全局 switch 和弹窗局部监听都不认）`).join(', '));

// 8.1b 同一份代码里别混两套写法：弹窗按钮不该再挂内联 onclick
const inlineHandlers = [...appCode.matchAll(/data-act="([^"]+)"[^>]*\sonclick=/g)].map((m) => m[1]);
ok('没有 data-act 按钮靠内联 onclick 兜底', inlineHandlers.length === 0,
  inlineHandlers.map((a) => `${a} 用了内联 onclick，应改成局部监听`).join('; '));

// 8.2 onChange 是按元素 id 分发的：每个 case 都必须有对应的 id="..."
//     （这里踩过坑：case 'set-theme' 从来没有元素对得上，是永远不执行的死分支）
const iChange = appSrc.indexOf('function onChange(');
const iInput = appSrc.indexOf('function onInput(');
ok('能定位 onChange / onInput 函数体', iChange > 0 && iInput > iChange, '源码结构变了，检查逻辑要跟着改');
const changeBody = appSrc.slice(iChange, iInput);
const idCases = [...changeBody.matchAll(/case '([^']+)'/g)]
  .map((m) => m[1])
  .filter((x) => !x.includes(':'));
const idsInHtml = new Set([...appSrc.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
const orphanCases = idCases.filter((x) => !idsInHtml.has(x));
ok(`onChange 的 ${idCases.length} 个 id 分支都能被触发`, orphanCases.length === 0,
  orphanCases.map((x) => `case '${x}' 找不到 id="${x}" 的元素（死分支）`).join('; '));

// 8.3 反向：带 data-act 的输入控件如果在 onChange 里按 id 处理，两处不能打架
const changeIds = [...appSrc.matchAll(/if \(t\.id === '([^']+)'\)/g)].map((m) => m[1]);
const ghostInputIds = [...new Set(changeIds)].filter((x) => !idsInHtml.has(x));
ok('onInput 引用的 id 都真实存在', ghostInputIds.length === 0, ghostInputIds.join(', '));

// 8.4 在 JS 里拼出来的样式类，CSS 里必须真的有定义。
//     少了不会报错，只是「显示得不对劲」，所以必须靠静态检查钉住。
//     这里的清单只列「缺了就会明显坏掉」的类，不追求覆盖全部。
const cssSrc = fs.readFileSync(path.join(ROOT, 'app.css'), 'utf8');
const REQUIRED_CLASSES = [
  'cloze-input',        // 打字作答的行内输入框
  'cloze-typed--ok',    // 答对
  'cloze-typed--bad',   // 答错
  'cloze-ans--fix',     // 答错时补的正确答案
  'leech-banner',       // 难卡提示条
  'snap-row',           // 快照列表行
];
// 用「类名后不能紧跟字母/数字/连字符」来匹配：
// 纯 indexOf 会把 .leech-bannerX 当成 .leech-banner，负向对照时露过这个破绽。
const missingCss = REQUIRED_CLASSES.filter(
  (c) => !new RegExp('\\.' + c.replace(/-/g, '\\-') + '(?![\\w-])').test(cssSrc)
);
ok(`关键样式类在 app.css 里都有定义（${REQUIRED_CLASSES.length} 个）`, missingCss.length === 0,
  missingCss.map((c) => `.${c} 没有样式定义`).join('; '));

// 8.5 打字作答的输入框必须带 input 前缀选择器：
//     全局的 input[type=text] 带属性选择器，特异性比裸 .cloze-input 高，
//     用裸类名会被 width:100% 覆盖，行内空会被撑成整行（真踩过的坑）。
ok('input.cloze-input 用了带 input 的选择器（否则被全局 input 规则盖掉）',
  /input\.cloze-input\s*\{/.test(cssSrc));

/* ---------------- 9. 插件模板里用的过滤器必须真实存在 ---------------- */
group('插件模板过滤器');

// 引擎对未知过滤器是【静默忽略】的（applyFilters 里 if (!fn) continue;），
// 所以 {{x|mcqkey}} 写错一个字母不会报错，只会渲染出原值 —— 极难发现。
// 已经真的踩过一次：mcqFilter 的注释里写了 mcqkey，但只注册了 mcq。
const allJsSrc = ALL.filter((f) => f.endsWith('.js'))
  .map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
const filtersBlock = (utilSrc.match(/var FILTERS = \{([\s\S]*?)\n  \};/) || [, ''])[1];
const knownFilters = new Set();
[...filtersBlock.matchAll(/^\s{4}([A-Za-z_$][\w$]*)\s*:/gm)].forEach((m) => knownFilters.add(m[1]));
[...allJsSrc.matchAll(/registerFilter\(\s*'([^']+)'/g)].forEach((m) => knownFilters.add(m[1]));

ok(`能从 util.js 读出过滤器表（${knownFilters.size} 个）`, knownFilters.size >= 15,
  `只读到 ${knownFilters.size} 个：${[...knownFilters].join(',')}`);

/** 从一段模板里抠出所有用到的过滤器名（管道右边那个词） */
function usedFilters(tpl) {
  const out = [];
  for (const m of String(tpl).matchAll(/\{\{\{?\s*([^{}]*?)\s*\}?\}\}/g)) {
    const expr = m[1];
    // {{#x}} {{/x}} {{^x}} 是区块语法，没有过滤器
    if (!expr || expr[0] === '#' || expr[0] === '/' || expr[0] === '^') continue;
    const parts = expr.split('|');
    for (let i = 1; i < parts.length; i++) {
      const n = parts[i].split(':')[0].trim();
      if (n) out.push(n);
    }
  }
  return out;
}

const badFilters = [];
// 9.1 示例插件（plugins/*.json）
const plDir = path.join(ROOT, 'plugins');
for (const f of fs.readdirSync(plDir).filter((x) => x.endsWith('.json') && x !== 'index.json')) {
  const p = JSON.parse(fs.readFileSync(path.join(plDir, f), 'utf8'));
  const t = p.templates || {};
  for (const side of Object.keys(t)) {
    for (const n of usedFilters(t[side])) {
      if (!knownFilters.has(n)) badFilters.push(`plugins/${f} 的 ${side} 用了未知过滤器 ${n}`);
    }
  }
}
// 9.2 内置插件的模板写在 js/plugins.js 的 JS 字符串里，单独抠出来
const plSrc = fs.readFileSync(path.join(ROOT, 'js/plugins.js'), 'utf8');
for (const m of plSrc.matchAll(/\b(front|back):\s*'((?:[^'\\]|\\.)*)'/g)) {
  for (const n of usedFilters(m[2])) {
    if (!knownFilters.has(n)) badFilters.push(`js/plugins.js 内置插件的 ${m[1]} 用了未知过滤器 ${n}`);
  }
}
ok('插件模板里用到的过滤器都真实存在', badFilters.length === 0, badFilters.join('; '));

// 9.3 文档里明确写出来的 mcq / mcqkey 必须真的注册过（注释里写了却没实现 = 用户照着写不生效）
ok('mcq 过滤器已注册', knownFilters.has('mcq'));
ok('mcqkey 过滤器已注册（文档里承诺过）', knownFilters.has('mcqkey'));
ok('letter 过滤器已注册（mcq 靠它编号）', knownFilters.has('letter'));

// 9.4 mcqFilter 吐出来的 class 必须被示例插件的 css 覆盖到，
//     否则选项列表会渲染成一坨没有边框和编号的纯文本。
const MCQ_CLASSES = ['mcq-opts', 'mcq-opt', 'mcq-k', 'mcq-t', 'mcq-mark', 'mcq-answer'];
const choiceCss = (JSON.parse(fs.readFileSync(path.join(plDir, '04-choice.json'), 'utf8')).css) || '';
const missMcq = MCQ_CLASSES.filter(
  (c) => !new RegExp('\\.' + c.replace(/-/g, '\\-') + '(?![\\w-])').test(choiceCss));
ok(`mcq 渲染出的 class 在 04-choice.json 的 css 里都有定义（${MCQ_CLASSES.length} 个）`,
  missMcq.length === 0, missMcq.map((c) => `.${c} 没样式`).join('; '));

/* ---------------- 10. 自定义 CSS 与内置示例一键安装 ---------------- */
group('自定义 CSS / 内置示例');

// 10.1 自定义 CSS：设置里必须有一个「只认主题变量、不吃 :root」的入口。
//      用 :root 写的覆盖在浅色主题下会被 html[data-theme="light"] 盖掉，
//      这是真踩过的坑，所以设置页的提示里必须点名 html[data-theme]。
{
  const storeSrc = fs.readFileSync(path.join(ROOT, 'js/store.js'), 'utf8');
  ok('DEFAULT_SETTINGS 里有 ui.customCss', /customCss\s*:/.test(storeSrc));
  ok('app.js 定义了 applyUserCss', /function applyUserCss\(/.test(appSrc));
  ok('自定义 CSS 注入到 <style id="fc-user-css">', /fc-user-css/.test(appSrc));
  ok('设置页有 #set-css 文本框', /id="set-css"/.test(appSrc));
  // 提示文案必须告诉用户用 html[data-theme]，否则浅色模式下改了没反应
  ok('设置页提示了要用 html[data-theme] 而不是 :root',
    /html\[data-theme\][^']{0,40}\{\s*--primary/.test(appSrc) ||
    appSrc.indexOf('html[data-theme]{--primary') >= 0);
  ok('自定义 CSS 存在 ui.customCss 里（跟主题一起保存）',
    /ui\.customCss\s*=/.test(appSrc));
}

// 10.2 内置示例一键安装：APK 里插件在 assets，
//      文件选择器看不到，这条路断了就没法装示例了。
{
  ok('app.js 定义了 loadExamples', /function loadExamples\(/.test(appSrc));
  ok('loadExamples 读 plugins/index.json',
    /fetch\(\s*'plugins\/index\.json'/.test(appSrc));
  ok('installExample 按清单里的 file 取插件',
    /fetch\(\s*'plugins\/'\s*\+\s*file/.test(appSrc));
  const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'plugins/index.json'), 'utf8'));
  const files = (idx.examples || []).map((e) => e.file);
  ok('清单里每条 file 都在 plugins/ 下', files.every((f) => fs.existsSync(path.join(ROOT, 'plugins', f))),
    files.filter((f) => !fs.existsSync(path.join(ROOT, 'plugins', f))).join(','));
  // 清单里列的文件必须真的是合格插件，否则一键安装装进去的是坏数据
  for (const f of files) {
    const p = JSON.parse(fs.readFileSync(path.join(ROOT, 'plugins', f), 'utf8'));
    ok(`清单里的 ${f} 有 id 和 fields`, !!(p.id && Array.isArray(p.fields) && p.fields.length));
  }
}


/* ---------------- 11. 文案全覆盖：每个字面量 T('...') 都要有英文译文 ----------------
 *
 * 为什么必须有这一条：词典的 key 就是中文原文（见 js/i18n.js 顶部的理由），
 * 「漏翻」的后果是**静默**的——那一句还是中文，不报错、不空白、功能照常，
 * 只有英文用户会突然看到一句中文，而且你永远不知道是哪句。
 * 所以把它变成硬断言：加一句 T('新文案') 却忘了往 en.js 里补，这里立刻红。
 *
 * 豁免规则：key 里**没有任何 CJK 字符**时跳过。
 *   这类 key 是 emoji（T('🎯') 当 tab 图标）、纯 HTML 标签、纯符号，
 *   本来就没有可翻的内容；真的给它们写一份原样映射只会让词典更难维护。
 */
group('文案全覆盖（en.js 词典）');
{
  const tKeys = new Map();   // 运行时 key -> [来源文件:行号]（T('...') 里的字面量）
  const cjkKeys = new Set();  // 其中含中文的，必须翻
  const allLiterals = new Set(); // 源码里出现过的一切字符串字面量（不管有没有包 T()）
  const CJK = /[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/;

  for (const rel of ALL) {
    if (!rel.endsWith('.js')) continue;
    if (rel.startsWith('js/lang/')) continue;      // 词典自己不算
    if (rel === 'js/i18n.js') continue;            // i18n 自身的注释里有示例
    const raw = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const src = stripComments(raw);
    const lines = src.split('\n');
    const re = /(?<![A-Za-z0-9_$.])T\(\s*'((?:[^'\\]|\\.)*)'/g;
    const anyLit = /'((?:[^'\\]|\\.)*)'/g;
    lines.forEach((line, i) => {
      // 所有字面量：孤儿检查靠它判断「这个键到底有没有人用」。
      // 因为存在**动态传参**的写法——renderTopbar 里的 T(t.label)、
      // plugins.js 里的 T(p.name)——正则看不见那个 T()，
      // 但键本身一定在源码里以字面量出现过。
      let a;
      while ((a = anyLit.exec(line)) !== null) {
        try { allLiterals.add(vm.runInNewContext("('" + a[1] + "')")); } catch (e) { /* 解不开就算了 */ }
      }
      let m;
      while ((m = re.exec(line)) !== null) {
        // 用 vm 解一次转义，保证和运行时的字符串逐字节一致（\n、\' 这些）
        let val;
        try { val = vm.runInNewContext("('" + m[1] + "')"); } catch (e) { val = m[1]; }
        // 含中文的 T('...') 才是「必须翻」的集合。
        // emoji / 纯 HTML 的键没有可翻内容，可以不进词典；
        // 但万一进了词典也不能被误判——所以孤儿检查另用 allLiterals。
        if (!tKeys.has(val)) tKeys.set(val, []);
        tKeys.get(val).push(`${rel}:${i + 1}`);
        if (CJK.test(val)) cjkKeys.add(val);
      }
    });
  }

  // 跑一遍 en.js，抓下它注册进去的词典
  const enSrc = fs.readFileSync(path.join(ROOT, 'js/lang/en.js'), 'utf8');
  let dict = null;
  {
    const cap = { register(id, map) { dict = map; } };
    const sb3 = { window: {}, console };
    sb3.window.I18n = cap;
    sb3.I18n = cap;
    vm.runInContext(enSrc, vm.createContext(sb3), { filename: 'js/lang/en.js' });
  }
  ok('en.js 成功注册了一份词典', !!dict && typeof dict === 'object');
  const dictKeys = new Set(Object.keys(dict || {}));

  const missing = [];
  cjkKeys.forEach((key) => { if (!dictKeys.has(key)) missing.push({ key, where: tKeys.get(key) }); });
  ok(`所有含中文的 T('...') 都有英文译文（共 ${cjkKeys.size} 条）`, missing.length === 0,
    missing.slice(0, 25).map((x) => `${x.key}  ← ${x.where[0]}`).join('\n      '));

  // 反向：词典里不该有本工程根本不用的孤儿条目（抄错 key 是常见事故）
  //
  // 例外：内置插件的文案是**动态**喂进 T() 的（plugins.js 的 localize 里是 T(p.name)、
  // T(p.description)、T(p.ai.prompt)），源码里没有 T('基础问答') 这种字面量，
  // 光靠正则扫是看不见的——不豁免的话每加一个内置插件文案都会误报孤儿。
  // 所以直接从已加载的 Plugins 模块里把它们捞出来当合法的动态 key。
  const dynKeys = new Set();
  try {
    (ctx.Plugins.BUILTIN || []).forEach((pl) => {
      [pl.name, pl.description, pl.ai && pl.ai.prompt].forEach((v) => { if (v) dynKeys.add(v); });
      (pl.fields || []).forEach((f) => {
        [f.label, f.placeholder, f.hint].forEach((v) => { if (v) dynKeys.add(v); });
        (f.options || []).forEach((o) => { if (typeof o === 'string') dynKeys.add(o); });
      });
    });
  } catch (e) { /* 拿不到 BUILTIN 只会让检查更严，不会放水 */ }
  ok('内置插件的动态文案已纳入豁免集', dynKeys.size >= 10, 'size=' + dynKeys.size);

  const orphans = [...dictKeys].filter((k) => !allLiterals.has(k) && !dynKeys.has(k));
  ok(`词典里没有用不到的孤儿条目（共 ${dictKeys.size} 条）`, orphans.length === 0,
    orphans.slice(0, 25).join('\n      '));
}

/* 模块顶层不许调用 T()。
 *
 * 为什么是硬错误：模块顶层在**加载时**执行，那时用户还没选语言、T 还是「原样返回」，
 * 于是那个字符串会被永远冻在中文上——切换语言后它不跟着变，而且不报错、不白屏。
 * 真踩过：TABS 的 label 原来写成 label: T('学习')，英文模式下整条 tabbar 仍是中文。
 * 正确写法是存原文（label: '学习'），到渲染时再 T(t.label)。
 */
group('i18n 用法');
{
  const hits = [];
  for (const rel of ALL) {
    if (!rel.endsWith('.js')) continue;
    if (rel.startsWith('js/lang/')) continue;
    if (rel === 'js/i18n.js') continue;
    const lines = stripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8')).split('\n');
    let depth = 0, inTemplate = false;
    lines.forEach((line, i) => {
      const atLineStart = depth;
      const hasT = /(?<![A-Za-z0-9_$.])T\(/.test(line);
      // 把行内字符串清空，只留下真正的括号；这样 T('{') 这种不会把深度算歪
      const cleaned = line.replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""');
      const ticks = (cleaned.match(/`/g) || []).length;
      if (inTemplate) { if (ticks % 2 === 1) inTemplate = false; }
      else if (ticks % 2 === 1) inTemplate = true;
      // 整个模块包在 (function(global){ ... })(window) 里，所以顶层的 depth 是 1
      if (hasT && !inTemplate && atLineStart <= 1) hits.push(`${rel}:${i + 1}`);
      for (const ch of cleaned) {
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
      }
    });
  }
  ok('模块顶层没有 T() 调用（那里的翻译会被冻在初始语言上）', hits.length === 0, hits.join('\n      '));
}

/* 内置示例插件的翻译。
 *
 * 示例插件是 JSON，进不了 js/lang/en.js 的词典（词典的键是中文源码字符串，
 * 而 JSON 里的文案也是中文、理论上能当键——但那样 en.js 会变成两个系统的杂物间）。
 * 改为每个 json 自带一个可选的 i18n 块，plugins.js 的 localize() 在读取时叠上去。
 * 这里保证「叠了」而不是「叠了个寂寞」：漏翻、写错字段 key、id 对不上，都在这里拦。
 */
group('示例插件 i18n');
{
  const SUPPORTED = new Set((ctx.I18n && ctx.I18n.LANGS ? ctx.I18n.LANGS : [{ id: 'en' }]).map((l) => l.id));
  const CJK = /[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]/;
  const idxPath = path.join(ROOT, 'plugins/index.json');
  let idx = null;
  try { idx = JSON.parse(fs.readFileSync(idxPath, 'utf8')); } catch (e) { /* 下面会报 */ }
  ok('读得到 plugins/index.json', !!idx && Array.isArray(idx.examples));

  const exs = (idx && idx.examples) || [];
  const noId = exs.filter((e) => !e.id).map((e) => e.file);
  ok('清单每一条都带 id（否则「安装/重新安装」判断会失灵）', noId.length === 0, noId.join(', '));

  const badMeta = [];
  exs.forEach((e) => {
    const en = e.i18n && e.i18n.en;
    ['name', 'desc'].forEach((k) => { if (!en || !en[k]) badMeta.push(`${e.file}: 缺 i18n.en.${k}`); });
    if (CJK.test(e.tags || '') && !(en && en.tags)) badMeta.push(`${e.file}: tags 还是中文`);
  });
  ok('清单的每条示例都有英文 name / desc（tags 含中文时也要翻）', badMeta.length === 0, badMeta.join('\n      '));

  const problems = [];
  const idMismatch = [];
  exs.forEach((e) => {
    const f = path.join(ROOT, 'plugins', e.file);
    if (!fs.existsSync(f)) { problems.push(`${e.file}: 文件不存在`); return; }
    let p = null;
    try { p = JSON.parse(fs.readFileSync(f, 'utf8')); }
    catch (err) { problems.push(`${e.file}: JSON 解析失败 — ${err.message}`); return; }

    if (e.id && p.id !== e.id) idMismatch.push(`${e.file}: 清单写 ${e.id}，插件里写 ${p.id}`);

    const en = p.i18n && p.i18n.en;
    if (!en) { problems.push(`${e.file}: 没有 i18n.en`); return; }
    ['name', 'description'].forEach((k) => { if (!en[k]) problems.push(`${e.file}: 缺 i18n.en.${k}`); });
    if (p.ai && p.ai.prompt && !(en.ai && en.ai.prompt)) problems.push(`${e.file}: AI 提示词还是中文`);

    // fields 补丁的 key 必须真实存在，否则是「翻了个不存在的字段」
    const keys = new Set((p.fields || []).map((x) => x.key));
    Object.keys(en.fields || {}).forEach((k) => {
      if (!keys.has(k)) problems.push(`${e.file}: i18n.en.fields.${k} 不是该插件的字段`);
    });
    // 每个含中文的 label / placeholder / hint 都必须有对应译文
    (p.fields || []).forEach((fd) => {
      const patch = (en.fields || {})[fd.key] || {};
      ['label', 'placeholder', 'hint'].forEach((k) => {
        if (fd[k] && CJK.test(fd[k]) && !patch[k]) problems.push(`${e.file}: 字段 ${fd.key}.${k} 没翻`);
      });
      if (Array.isArray(fd.options) && patch.options && !Array.isArray(patch.options)) {
        fd.options.forEach((o) => {
          const v = (o && typeof o === 'object') ? o.value : o;
          if (typeof v === 'string' && CJK.test(v) && !patch.options[v]) {
            problems.push(`${e.file}: 字段 ${fd.key} 的选项「${v}」没翻`);
          }
        });
      }
    });
    // i18n 里的语言必须是引擎认得的，否则那份翻译永远不会被选中
    Object.keys(p.i18n || {}).forEach((lg) => {
      if (!SUPPORTED.has(lg)) problems.push(`${e.file}: i18n.${lg} 不是受支持的语言`);
    });
  });
  ok('清单 id 与插件文件的 id 一致', idMismatch.length === 0, idMismatch.join('\n      '));
  ok(`示例插件的英文覆盖完整（${exs.length} 个插件）`, problems.length === 0, problems.slice(0, 25).join('\n      '));

  // localize() 真的生效：把语言切成 en 之后，每个示例插件的 name 必须变过
  const notApplied = [];
  exs.forEach((e) => {
    const f = path.join(ROOT, 'plugins', e.file);
    if (!fs.existsSync(f)) return;
    let p = null;
    try { p = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (err) { return; }
    const before = ctx.I18n.lang();
    ctx.I18n.setLang('en');
    const out = ctx.Plugins.localize(p);
    ctx.I18n.setLang(before);
    if (out.name === p.name) notApplied.push(`${e.file}: localize() 后 name 没变`);
    if (out.fields && p.fields && out.fields[0] && p.fields[0] && out.fields[0] === p.fields[0]) {
      notApplied.push(`${e.file}: localize() 没有拷字段（原地改了原对象？）`);
    }
  });
  ok('localize() 对示例插件确实生效，且不污染原对象', notApplied.length === 0, notApplied.join('\n      '));

  // 导出白名单漏一个字段 = 分享/编辑时悄悄丢东西（i18n 差一点就这么丢了）。
  // 而且必须用 raw() 取原始定义：显示层那份已经翻过，存回去会把插件永久锁死当前语言。
  const plSrc = fs.readFileSync(path.join(ROOT, 'js/plugins.js'), 'utf8');
  ok('导出用的是原始定义（raw(id)）而不是显示层（get(id)）', /var p = raw\(id\) \|\| get\(id\)/.test(plSrc));
  const wl = plSrc.match(/\[([^\]]*?)\]\.forEach\(function \(k\) \{\s*\n?\s*if \(p\[k\]/);
  ok('解析得到 exportPlugin 的字段白名单', !!wl);
  if (wl) {
    ['id', 'name', 'fields', 'templates', 'css', 'ai', 'i18n'].forEach((k) => {
      ok(`导出白名单包含 ${k}（漏了会在分享时丢字段）`, new RegExp(`'${k}'`).test(wl[1]));
    });
  }
}

/* 插件页每行按钮。
 *
 * 真踩过：内置插件的行上并排出现**两个一模一样的「停用」**——因为删除按钮写成了
 * `(p.builtin ? T('停用') : T('删除'))`，内置插件删不掉却给了一颗看起来能删的按钮，
 * 点下去只是再停用一次，还带一个「内置插件已停用」的提示。用户完全无法理解。
 * 内置插件只该有「停用/启用」一颗；删除按钮只给自装插件。
 */
group('插件行按钮');
{
  // 必须去掉注释再查：app.js 里那段说明「以前是这么写错的」的注释本身就含旧写法
  const app = stripComments(fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8'));
  const delAt = app.indexOf('data-act="pl:del"');
  ok('找得到插件行的删除按钮模板', delAt > 0);
  const before = delAt > 0 ? app.slice(Math.max(0, delAt - 300), delAt) : '';
  ok('删除按钮只在非内置插件上渲染（p.builtin ? \'\' : …）', /p\.builtin \? '' :\s*$/.test(before.trimEnd()) || /p\.builtin \? '' :/.test(before));
  ok('没有了「内置插件也显示成停用」的旧写法',
    !/p\.builtin \? T\('停用'\)/.test(app) && !/p\.builtin \? T\('Disable'\)/.test(app));
  ok('停用/启用按钮仍在（内置插件靠它管开关）', /data-act="pl:toggle"/.test(app));
  const hasAt = fs.readFileSync(path.join(ROOT, 'js/plugins.js'), 'utf8');
  ok('Plugins.has() 已导出（判断装没装只能用 has，不能用 get）', /has:\s*has\b/.test(hasAt));
}

/* ---------------- 结果 ---------------- */
console.log('\n' + '='.repeat(52));
if (fail === 0) {
  console.log(`✓ 静态检查全部通过：${pass} 项`);
  console.log('='.repeat(52));
  process.exit(0);
} else {
  console.log(`✗ ${fail} 项失败 / 共 ${pass + fail} 项`);
  failures.forEach((f) => console.log('   · ' + f));
  console.log('='.repeat(52));
  process.exit(1);
}
