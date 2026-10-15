/* ============================================================
 * util.js —— 基础工具 + Mustache 风格模板引擎 + 极简存储层
 * 无任何外部依赖，全部为传统 <script>（不用 ES Module），
 * 以便 APK 中通过 file:// 或 WebViewAssetLoader 直接加载。
 * ============================================================ */
(function (global) {
  'use strict';
  // 界面文案：util 也要能翻译（fmtDue、确认框按钮、toast）。i18n.js 必须排在它前面。
  var T = global.I18n.T;

  /* ---------------- DOM ---------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function el(tag, attrs, html) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'dataset') Object.keys(attrs[k]).forEach(function (d) { n.dataset[d] = attrs[k][d]; });
      else if (k.slice(0, 2) === 'on' && typeof attrs[k] === 'function') n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) n.setAttribute(k, attrs[k]);
    });
    if (html !== undefined && html !== null) n.innerHTML = html;
    return n;
  }

  /* ---------------- 文本 ---------------- */
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function nl2br(s) { return esc(s).replace(/\n/g, '<br>'); }

  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' +
      Math.random().toString(36).slice(2, 8);
  }

  function deepClone(o) { return o === undefined ? o : JSON.parse(JSON.stringify(o)); }

  function debounce(fn, ms) {
    var t = null;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms || 200);
    };
  }

  /* ---------------- 时间 ---------------- */
  var DAY = 86400000;
  function now() { return Date.now(); }
  function fmtTime(ts) {
    if (!ts) return '—';
    var d = new Date(ts);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function fmtDue(ts) {
    if (!ts) return T('新卡');
    var diff = ts - now();
    if (diff <= 0) return T('待复习');
    if (diff < 3600000) return Math.round(diff / 60000) + T(' 分钟后');
    if (diff < DAY) return Math.round(diff / 3600000) + T(' 小时后');
    var days = Math.round(diff / DAY);
    // 超过约 3 年就换成年，超过 10 年直接说「很久以后」——
    // 一张被反复评「简单」的卡，间隔会指数增长到天文数字，逐位念出来没有意义。
    if (days > 3650) return T('很久以后');
    if (days > 1095) return Math.round(days / 365) + T(' 年后');
    if (days > 60) return Math.round(days / 30) + T(' 个月后');
    return days + T(' 天后');
  }
  function startOfDay(ts) {
    var d = new Date(ts || now());
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  /* ---------------- Toast / Dialog ---------------- */
  function toast(msg, type) {
    var box = document.getElementById('toast');
    if (!box) return;
    var t = el('div', { class: 'toast toast--' + (type || 'info') }, esc(msg));
    box.appendChild(t);
    setTimeout(function () { t.classList.add('toast--out'); }, 1800);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 2300);
  }

  function confirmBox(title, message, okText) {
    return new Promise(function (resolve) {
      var root = document.getElementById('modal-root');
      var back = el('div', { class: 'modal-backdrop' });
      var box = el('div', { class: 'modal' },
        '<h3>' + esc(title) + '</h3><p>' + nl2br(message) + '</p>' +
        '<div class="modal-actions">' +
        '<button class="btn btn--ghost" data-act="no">' + esc(T('取消')) + '</button>' +
        '<button class="btn btn--danger" data-act="yes">' + esc(okText || T('确定')) + '</button>' +
        '</div>');
      back.appendChild(box);
      function close(v) { if (back.parentNode) back.parentNode.removeChild(back); resolve(v); }
      box.addEventListener('click', function (e) {
        var a = e.target.getAttribute && e.target.getAttribute('data-act');
        if (a === 'yes') close(true); else if (a === 'no') close(false);
      });
      back.addEventListener('click', function (e) { if (e.target === back) close(false); });
      root.appendChild(back);
    });
  }

  function promptBox(title, fields) {
    // fields: [{key,label,value,type,placeholder,options}]
    return new Promise(function (resolve) {
      var root = document.getElementById('modal-root');
      var back = el('div', { class: 'modal-backdrop' });
      var body = fields.map(function (f) {
        var v = f.value === undefined || f.value === null ? '' : String(f.value);
        var input;
        if (f.type === 'textarea') {
          input = '<textarea data-k="' + esc(f.key) + '" placeholder="' + esc(f.placeholder || '') + '">' + esc(v) + '</textarea>';
        } else if (f.type === 'select') {
          input = '<select data-k="' + esc(f.key) + '">' + (f.options || []).map(function (o) {
            var val = o.value !== undefined ? o.value : o;
            var lab = o.label !== undefined ? o.label : o;
            return '<option value="' + esc(val) + '"' + (String(val) === v ? ' selected' : '') + '>' + esc(lab) + '</option>';
          }).join('') + '</select>';
        } else {
          input = '<input data-k="' + esc(f.key) + '" type="' + esc(f.type || 'text') + '" value="' + esc(v) + '" placeholder="' + esc(f.placeholder || '') + '">';
        }
        return '<label class="field"><span>' + esc(f.label) + '</span>' + input + '</label>';
      }).join('');
      var box = el('div', { class: 'modal' },
        '<h3>' + esc(title) + '</h3>' + body +
        '<div class="modal-actions">' +
        '<button class="btn btn--ghost" data-act="no">' + esc(T('取消')) + '</button>' +
        '<button class="btn btn--primary" data-act="yes">' + esc(T('确定')) + '</button></div>');
      back.appendChild(box);
      function close(v) { if (back.parentNode) back.parentNode.removeChild(back); resolve(v); }
      box.addEventListener('click', function (e) {
        var a = e.target.getAttribute && e.target.getAttribute('data-act');
        if (a === 'no') return close(null);
        if (a !== 'yes') return;
        var out = {};
        $$('[data-k]', box).forEach(function (n) { out[n.getAttribute('data-k')] = n.value; });
        close(out);
      });
      back.addEventListener('click', function (e) { if (e.target === back) close(null); });
      root.appendChild(back);
      setTimeout(function () { var f = $('[data-k]', box); if (f) f.focus(); }, 60);
    });
  }

  /* ---------------- 文件 ---------------- */
  /* 保存文件的两条通道，按可靠性排序：
   *
   *   1. FlashCardsNative.saveFileBase64 / saveFile —— 本仓库 android/ 那套壳。
   *      落点与权限由壳自己处理，是唯一「我们能保证」的通道。
   *   2. 标准下载（blob: + <a download>）—— 浏览器里一定可用；WebView 里只有装了
   *      DownloadListener 的壳才会把它转交系统下载器。系统下载器写「下载」目录
   *      **不需要应用持有存储权限**，是 Android 10+ 上唯一能落盘的正路。
   *
   * 为什么不再调 HopWeb 那套壳的 Android.downloadFileFromBase64：
   *   它的 AndroidManifest 里只有 INTERNET / VIBRATE，**没有任何存储权限**，
   *   却拿 File API 往 /storage/emulated/0/Download 直接写文件 —— 在 Android 10+
   *   上这个写操作注定失败；用户实测还会在它的 Base64 解码处抛
   *   「NullPointerException: decode(data) must not be null」把整个应用打崩。
   *   崩溃比「点了没反应」严重得多，所以这条通道直接去掉。
   *   需要纯文本搬运时用 copyText()，那条路不需要任何权限。 */
  function nativeSaveBase64(filename, b64, mime) {
    var N = global.FlashCardsNative;
    if (N && typeof N.saveFileBase64 === 'function') {
      try { if (N.saveFileBase64(filename, b64, mime || 'application/octet-stream') !== false) return true; }
      catch (e) { /* 桥调用失败则回落 */ }
    }
    return false;
  }

  function nativeSave(filename, text, mime) {
    try {
      var N = global.FlashCardsNative;
      if (N && typeof N.saveFile === 'function') {
        return N.saveFile(filename, String(text), mime || 'application/json') !== false;
      }
    } catch (e) { /* 桥调用失败则回落 */ }
    return false;
  }

  function browserDownload(filename, blob) {
    var url = URL.createObjectURL(blob);
    var a = el('a', { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }

  /**
   * 保存一段二进制。
   * @param {string} filename
   * @param {Uint8Array} bytes
   * @param {string} mime
   * @returns {boolean} 是否走了原生通道
   */
  function downloadBytes(filename, bytes, mime) {
    var type = mime || 'application/octet-stream';
    if (nativeSaveBase64(filename, global.Zip.base64(bytes), type)) return true;
    browserDownload(filename, new Blob([bytes], { type: type }));
    return false;
  }

  function download(filename, text, mime) {
    if (nativeSave(filename, text, mime)) return;
    // 只吃文本的老壳走不了二进制；把文本按 UTF-8 编成字节，统一交给桥
    if (global.Zip && nativeSaveBase64(filename, global.Zip.base64(global.Zip.utf8(text)), mime)) return;
    browserDownload(filename, new Blob([String(text)], { type: (mime || 'application/json') + ';charset=utf-8' }));
  }

  function readFile(file, as) {
    return new Promise(function (resolve) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { resolve(null); };
      if (as === 'buffer') r.readAsArrayBuffer(file); else r.readAsText(file, 'utf-8');
    });
  }

  /** 选一个文件，读成二进制（导入 zip 用） */
  function pickFileBinary(accept) {
    return new Promise(function (resolve) {
      var inp = el('input', { type: 'file', accept: accept || '.zip,application/zip' });
      inp.style.display = 'none';
      document.body.appendChild(inp);
      inp.addEventListener('change', function () {
        var f = inp.files && inp.files[0];
        if (!f) { resolve(null); inp.remove(); return; }
        readFile(f, 'buffer').then(function (ab) {
          inp.remove();
          if (!ab) { resolve(null); return; }
          resolve({ name: f.name, bytes: new Uint8Array(ab) });
        });
      });
      inp.click();
    });
  }

  function pickFile(accept) {
    return new Promise(function (resolve) {
      var inp = el('input', { type: 'file', accept: accept || '.json,application/json' });
      inp.style.display = 'none';
      document.body.appendChild(inp);
      inp.addEventListener('change', function () {
        var f = inp.files && inp.files[0];
        if (!f) { resolve(null); inp.remove(); return; }
        var r = new FileReader();
        r.onload = function () { resolve({ name: f.name, text: String(r.result) }); inp.remove(); };
        r.onerror = function () { resolve(null); inp.remove(); };
        r.readAsText(f, 'utf-8');
      });
      inp.click();
    });
  }

  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(t).then(function () { return true; }).catch(function () { return legacyCopy(t); });
    }
    return Promise.resolve(legacyCopy(t));
  }
  function legacyCopy(t) {
    try {
      var ta = el('textarea', {}); ta.value = t;
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      var ok = document.execCommand('copy');
      ta.remove(); return ok;
    } catch (e) { return false; }
  }

  /* ---------------- 存储 ---------------- */
  var NS = 'flashcards.v1.';
  var memory = {};
  var hasLS = (function () {
    try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); return true; }
    catch (e) { return false; }
  })();

  var Store = {
    get: function (key, def) {
      try {
        var raw = hasLS ? localStorage.getItem(NS + key) : memory[key];
        if (raw === null || raw === undefined) return def;
        return JSON.parse(raw);
      } catch (e) { return def; }
    },
    set: function (key, val) {
      var raw = JSON.stringify(val);
      try { if (hasLS) localStorage.setItem(NS + key, raw); else memory[key] = raw; }
      catch (e) { memory[key] = raw; toast(T('本地存储写入失败：') + e.message, 'error'); }
      return val;
    },
    del: function (key) {
      try { if (hasLS) localStorage.removeItem(NS + key); delete memory[key]; } catch (e) { }
    },
    keys: function () {
      var out = [];
      try {
        if (hasLS) {
          for (var i = 0; i < localStorage.length; i++) {
            var k = localStorage.key(i);
            if (k.indexOf(NS) === 0) out.push(k.slice(NS.length));
          }
        } else { out = Object.keys(memory); }
      } catch (e) { }
      return out;
    }
  };

  /* ============================================================
   * 模板引擎（Mustache 子集）
   *   {{key}}            —— HTML 转义输出
   *   {{{key}}}          —— 原样输出（允许 HTML）
   *   {{key|filter:arg}} —— 过滤器管道
   *   {{#key}}...{{/key}}—— 区块：数组则遍历，真值则渲染一次
   *   {{@index}} / {{@number}} / {{@first}} / {{@last}} / {{@length}}
   *                      —— 在数组区块内部可用，取当前这一轮的下标/序号等。
   *                         刻意用 @ 开头：普通字段名不太可能长这样，不会撞车。
   * 支持嵌套区块（@ 元信息用栈记录，嵌套遍历各层互不干扰）。
   * ============================================================ */

  var FILTERS = {
    esc: function (v) { return esc(v); },
    raw: function (v) { return String(v === null || v === undefined ? '' : v); },
    nl2br: function (v) { return nl2br(v); },
    upper: function (v) { return String(v || '').toUpperCase(); },
    lower: function (v) { return String(v || '').toLowerCase(); },
    trim: function (v) { return String(v || '').trim(); },
    length: function (v) { return (v && v.length) || 0; },
    json: function (v) { try { return JSON.stringify(v, null, 2); } catch (e) { return ''; } },
    first: function (v) { return (v && v.length) ? v[0] : ''; },
    last: function (v) { return (v && v.length) ? v[v.length - 1] : ''; },
    join: function (v, sep) { return Array.isArray(v) ? v.join(sep === undefined ? ', ' : sep) : String(v || ''); },
    default: function (v, d) { return (v === '' || v === null || v === undefined) ? d : v; },
    wrap: function (v, pre, suf) { return String(pre || '') + String(v === null || v === undefined ? '' : v) + String(suf === undefined ? (pre || '') : suf); },
    repeat: function (v, n) { return new Array(Math.max(0, parseInt(n, 10) || 0) + 1).join(String(v || '')); },
    shuffle: function (v) {
      var a = Array.isArray(v) ? v.slice() : String(v || '').split('');
      for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
      return a;
    },
    list: function (v) {
      if (Array.isArray(v)) return v;
      if (v === null || v === undefined || v === '') return [];
      return String(v).split(/\r?\n|,|;|、/).map(function (s) { return s.trim(); }).filter(Boolean);
    },
    // 0→A、1→B … 25→Z、26→AA …（给选择题之类的插件自动编号用）
    letter: function (v) {
      var n = parseInt(v, 10);
      if (isNaN(n) || n < 0) return '';
      n = Math.floor(n);
      var s = '';
      do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
      return s;
    }
  };

  function registerFilter(name, fn) { FILTERS[name] = fn; }

  function parseExpr(expr) {
    var parts = String(expr).split('|');
    var head = parts.shift().trim();
    var filters = parts.map(function (p) {
      p = p.trim();
      var i = p.indexOf(':');
      if (i < 0) return { name: p, args: [] };
      var args = p.slice(i + 1).split(',').map(function (s) { return s.trim(); });
      return { name: p.slice(0, i).trim(), args: args };
    });
    return { path: head, filters: filters };
  }

  // {{@index}} 这类循环元信息。用栈：嵌套数组区块时，{{@index}} 取的是
  // 「最内层正在遍历的那一层」，和直觉一致；非数组区块不入栈，
  // 所以里层还能读到外层数组的下标。
  var loopStack = [];

  /**
   * 在当前上下文里查一个路径。
   * 必须能把「查不到」和「查到了但值是空字符串」区分开 —— 前者要继续往上找，
   * 后者就是最终结果。所以返回 {found, value} 而不是直接返回 ''。
   */
  function lookup(path, ctx) {
    if (path === '.' || path === 'this') return { found: true, value: ctx };
    var cur = ctx;
    var segs = path.split('.');
    for (var i = 0; i < segs.length; i++) {
      if (cur === null || cur === undefined) return { found: false };
      var s = segs[i];
      if (s === '') continue;
      // 支持 a[0] 形式
      var m = s.match(/^([^\[]*)\[(\d+)\]$/);
      if (m) {
        cur = m[1] ? cur[m[1]] : cur;
        if (cur === null || cur === undefined) return { found: false };
        cur = cur[parseInt(m[2], 10)];
      } else {
        cur = cur[s];
      }
      if (cur === undefined) return { found: false };
    }
    return { found: true, value: cur };
  }

  /**
   * 作用域链：先在当前上下文里找，找不到再一层层往外找（Mustache 的规矩）。
   * 没有这条链，{{#keypoint}}{{{keypoint}}}{{/keypoint}} 会渲染成空 ——
   * 因为进区块后上下文已经变成那个字符串了，再点 keypoint 自然什么都没有。
   * 这是插件作者最容易踩的坑，所以按规范实现，而不是要求他们改写成 {{{.}}}。
   */
  function resolvePath(path, ctx) {
    if (path.charAt(0) === '@') {
      var top = loopStack[loopStack.length - 1];
      if (!top) return '';
      var meta = top[path.slice(1)];
      return meta === undefined ? '' : meta;
    }
    var hit = lookup(path, ctx);
    if (hit.found) return hit.value;
    for (var i = ctxStack.length - 1; i >= 0; i--) {
      var h = lookup(path, ctxStack[i]);
      if (h.found) return h.value;
    }
    return '';
  }

  // 区块渲染时把上下文压进来，供 resolvePath 向外回溯
  var ctxStack = [];

  function applyFilters(val, filters) {
    for (var i = 0; i < filters.length; i++) {
      var f = filters[i];
      var fn = FILTERS[f.name];
      if (!fn) continue;
      var args = f.args.map(function (a) {
        if (/^\d+$/.test(a)) return parseInt(a, 10);
        if (a === 'true') return true;
        if (a === 'false') return false;
        return a;
      });
      try { val = fn.apply(null, [val].concat(args)); } catch (e) { /* 忽略过滤器错误 */ }
    }
    return val;
  }

  function compile(tpl) {
    var root = { children: [] };
    var stack = [root];
    var re = /\{\{\{([\s\S]+?)\}\}\}|\{\{\s*([#\/^]?)\s*([\s\S]+?)\s*\}\}/g;
    var last = 0, m;
    function push(n) { stack[stack.length - 1].children.push(n); }
    while ((m = re.exec(tpl)) !== null) {
      if (m.index > last) push({ type: 'text', value: tpl.slice(last, m.index) });
      last = re.lastIndex;
      if (m[1] !== undefined) {
        push({ type: 'raw', expr: m[1].trim() });
      } else {
        var sigil = m[2];
        var expr = m[3].trim();
        if (sigil === '#') {
          var node = { type: 'section', expr: expr, children: [] };
          push(node); stack.push(node);
        } else if (sigil === '^') {
          var inv = { type: 'inverted', expr: expr, children: [] };
          push(inv); stack.push(inv);
        } else if (sigil === '/') {
          if (stack.length > 1) stack.pop();
        } else {
          push({ type: 'var', expr: expr });
        }
      }
    }
    if (last < tpl.length) push({ type: 'text', value: tpl.slice(last) });
    return root;
  }

  function renderNodes(nodes, ctx) {
    // 自己这一层入栈，区块递归进来时会再压一层。
    // resolvePath 找不到时就从栈顶往下逐层回溯（作用域链）。
    ctxStack.push(ctx);
    var out = '';
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.type === 'text') { out += n.value; continue; }
      if (n.type === 'raw') {
        var e = parseExpr(n.expr);
        out += String(applyFilters(resolvePath(e.path, ctx), e.filters));
        continue;
      }
      if (n.type === 'var') {
        var e2 = parseExpr(n.expr);
        var v = applyFilters(resolvePath(e2.path, ctx), e2.filters);
        out += esc(v === null || v === undefined ? '' : (Array.isArray(v) ? v.join(', ') : v));
        continue;
      }
      if (n.type === 'section' || n.type === 'inverted') {
        var e3 = parseExpr(n.expr);
        var val = applyFilters(resolvePath(e3.path, ctx), e3.filters);
        var truthy = !(val === false || val === null || val === undefined || val === '' ||
          (Array.isArray(val) && val.length === 0));
        if (n.type === 'inverted') { if (!truthy) out += renderNodes(n.children, ctx); continue; }
        if (!truthy) continue;
        if (Array.isArray(val)) {
          for (var j = 0; j < val.length; j++) {
            loopStack.push({
              index: j,
              number: j + 1,
              first: j === 0,
              last: j === val.length - 1,
              length: val.length
            });
            out += renderNodes(n.children, val[j]);
            loopStack.pop();
          }
        } else if (val === true) {
          out += renderNodes(n.children, ctx);
        } else {
          out += renderNodes(n.children, val);
        }
      }
    }
    ctxStack.pop();
    return out;
  }

  var tplCache = {};
  function renderTemplate(tpl, ctx) {
    if (tpl === null || tpl === undefined) return '';
    var key = String(tpl);
    var tree = tplCache[key];
    if (!tree) { tree = compile(key); tplCache[key] = tree; }
    return renderNodes(tree.children, ctx || {});
  }

  /* ---------------- 杂项 ---------------- */
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function parseNum(v, d) { var n = parseFloat(v); return isNaN(n) ? d : n; }
  function uniq(arr) { return arr.filter(function (v, i) { return arr.indexOf(v) === i; }); }

  /* ============================================================
   * CSV / TSV
   *   自己写解析器而不是简单 split(',')：卡片正反面里带逗号、换行、
   *   引号是常态，用 split 会把一张卡拆成好几张。这里按 RFC4180 处理
   *   引号包裹与 "" 转义。
   * ============================================================ */

  // 猜分隔符：看第一行里 制表符 / 逗号 / 分号 哪个最多
  function guessDelimiter(text) {
    var line = String(text || '').split(/\r?\n/)[0] || '';
    var counts = [['\t', 0], [',', 0], [';', 0]];
    for (var i = 0; i < line.length; i++) {
      // 引号内的分隔符不算数
      if (line.charAt(i) === '"') {
        var j = line.indexOf('"', i + 1);
        if (j < 0) break;
        i = j;
        continue;
      }
      for (var k = 0; k < counts.length; k++) {
        if (line.charAt(i) === counts[k][0]) counts[k][1]++;
      }
    }
    counts.sort(function (a, b) { return b[1] - a[1]; });
    return counts[0][1] > 0 ? counts[0][0] : ',';
  }

  /** 解析 CSV/TSV → { delim, rows: [[cell,...],...] }（rows 已去掉全空行） */
  function parseDSV(text, delim) {
    var src = String(text === null || text === undefined ? '' : text).replace(/^\ufeff/, '');
    delim = delim || guessDelimiter(src);
    var rows = [];
    var row = [];
    var cell = '';
    var i = 0, inQ = false;
    while (i < src.length) {
      var c = src.charAt(i);
      if (inQ) {
        if (c === '"') {
          if (src.charAt(i + 1) === '"') { cell += '"'; i += 2; continue; }
          inQ = false; i++; continue;
        }
        cell += c; i++; continue;
      }
      if (c === '"' && cell === '') { inQ = true; i++; continue; }
      if (c === delim) { row.push(cell); cell = ''; i++; continue; }
      if (c === '\r') { i++; continue; }
      if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; continue; }
      cell += c; i++;
    }
    row.push(cell);
    rows.push(row);
    rows = rows.filter(function (r) {
      return r.some(function (x) { return String(x).trim() !== ''; });
    });
    return { delim: delim, rows: rows };
  }

  function toDSV(rows, delim) {
    delim = delim || ',';
    return (rows || []).map(function (r) {
      return (r || []).map(function (v) {
        var s = String(v === null || v === undefined ? '' : v);
        if (s.indexOf(delim) >= 0 || /["\r\n]/.test(s)) {
          return '"' + s.split('"').join('""') + '"';
        }
        return s;
      }).join(delim);
    }).join('\r\n');
  }

  /* ============================================================
   * IndexedDB 极简封装（只用于自动快照备份）
   *   localStorage 只有 ~5MB 且清缓存就全没了，快照必须放在 IndexedDB。
   *   没有 IDB 时（Node 自检沙箱、极老内核）全部安全降级成 no-op。
   * ============================================================ */
  var idb = {
    available: function () {
      try { return typeof global.indexedDB !== 'undefined' && !!global.indexedDB; }
      catch (e) { return false; }
    },
    open: function (name, storeName, version) {
      return new Promise(function (resolve, reject) {
        if (!idb.available()) { reject(new Error('no-indexeddb')); return; }
        var req = global.indexedDB.open(name, version || 1);
        req.onupgradeneeded = function () {
          var db = req.result;
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName, { keyPath: 'id' });
          }
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error || new Error('idb-open-failed')); };
      });
    },
    tx: function (db, storeName, mode, fn) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(storeName, mode);
        var st = t.objectStore(storeName);
        var out;
        try { out = fn(st); } catch (e) { reject(e); return; }
        t.oncomplete = function () {
          resolve(out && out.result !== undefined ? out.result : out);
        };
        t.onerror = function () { reject(t.error || new Error('idb-tx-failed')); };
        t.onabort = function () { reject(t.error || new Error('idb-aborted')); };
      });
    }
  };

  global.U = {
    $: $, $$: $$, el: el, esc: esc, nl2br: nl2br, uid: uid, deepClone: deepClone,
    debounce: debounce, now: now, DAY: DAY, fmtTime: fmtTime, fmtDue: fmtDue, startOfDay: startOfDay,
    toast: toast, confirmBox: confirmBox, promptBox: promptBox,
    download: download, downloadBytes: downloadBytes, pickFile: pickFile, pickFileBinary: pickFileBinary, copyText: copyText,
    Store: Store, NS: NS,
    renderTemplate: renderTemplate, registerFilter: registerFilter, FILTERS: FILTERS,
    clamp: clamp, parseNum: parseNum, uniq: uniq,
    guessDelimiter: guessDelimiter, parseDSV: parseDSV, toDSV: toDSV,
    idb: idb
  };
})(window);
