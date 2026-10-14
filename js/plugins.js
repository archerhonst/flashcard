/* ============================================================
 * plugins.js —— JSON 插件系统
 *
 * 插件 = 一个纯 JSON 对象，声明：
 *   fields    字段 Schema（决定卡片编辑器长什么样）
 *   templates 正反面模板（Mustache 子集 + 过滤器）
 *   ai        AI 挖空/生成该卡型的提示词契约
 *   css       该卡型的样式（渲染多张卡时自动注入，作用域隔离）
 *
 * 用户把 .json 文件丢进来即可扩展新的卡片类型，无需改一行代码。
 * ============================================================ */
(function (global) {
  'use strict';
  var U = global.U;
  var Cloze = global.Cloze;
  // 内置插件的名称、说明、字段标签、AI 提示词都要跟着界面语言走（见下面的 localize）
  var T = global.I18n.T;

  var API_VERSION = 1;
  var STORE_KEY = 'plugins';

  var FIELD_TYPES = ['text', 'textarea', 'number', 'select', 'list', 'tags', 'cloze', 'date', 'checkbox'];

  /* ---------------- 内置插件 ---------------- */
  var BUILTIN = [
    {
      id: 'builtin.basic',
      name: '基础问答',
      icon: '📇',
      version: '1.0.0',
      apiVersion: 1,
      builtin: true,
      description: '最经典的正反面卡片：正面问题，背面答案。',
      mode: 'template',
      fields: [
        { key: 'front', label: '正面（问题）', type: 'textarea', required: true, placeholder: '例如：TCP 三次握手的作用是什么？' },
        { key: 'back', label: '背面（答案）', type: 'textarea', required: true, placeholder: '例如：同步双方初始序列号，确认收发能力…' },
        { key: 'note', label: '备注', type: 'textarea', placeholder: '选填，仅在答案页显示' }
      ],
      templates: {
        front: '{{front}}',
        back: '{{back}}{{#note}}<hr class="fc-hr"><div class="fc-note">{{{note}}}</div>{{/note}}'
      },
      css: '.fc-note{font-size:.9em;opacity:.75;background:rgba(127,127,127,.10);padding:.6em .8em;border-radius:.5em}',
      ai: {
        kind: 'cards',
        prompt: '请把下面材料拆成 {{count}} 张问答闪卡。\n' +
          '要求：每张卡只考一个知识点；问题必须能脱离原文独立理解；答案简洁准确（不超过 80 字）。\n' +
          '只输出 JSON，格式：{"cards":[{"front":"问题","back":"答案","note":"可选备注"}]}\n\n材料：\n{{text}}'
      }
    },
    {
      id: 'builtin.cloze',
      name: '挖空（Cloze）',
      icon: '🕳️',
      version: '1.0.0',
      apiVersion: 1,
      builtin: true,
      description: '在一段文本中挖掉关键词。标记格式 {{c1::答案}} 或 {{c1::答案::提示}}。',
      mode: 'cloze',
      fields: [
        { key: 'text', label: '挖空文本', type: 'cloze', required: true, placeholder: '在里面选中文字点「挖空」，或用「智能挖空」自动生成' },
        { key: 'extra', label: '补充说明', type: 'textarea', placeholder: '选填，复习时显示在答案下方' },
        { key: 'source', label: '来源', type: 'text', placeholder: '选填，如《生理学》第 3 章' }
      ],
      templates: {
        front: '{{text}}',
        back: '{{text}}{{#extra}}<hr class="fc-hr"><div class="fc-note">{{{extra}}}</div>{{/extra}}'
      },
      css: '.fc-note{font-size:.9em;opacity:.8;background:rgba(127,127,127,.10);padding:.6em .8em;border-radius:.5em}',
      ai: {
        kind: 'cloze',
        prompt: '请把下面材料改写成挖空填空题，共挖 {{count}} 个空。\n' +
          '规则：\n' +
          '1. 只挖关键信息（术语、数字、年份、结论），不要挖虚词；\n' +
          '2. 使用 {{c1::答案}} 语法，编号从 c1 开始依次递增；\n' +
          '3. 除挖空标记外，原文必须逐字保留，不要改写、不要总结；\n' +
          '4. 必要时可写成 {{c1::答案::提示}}，提示是帮你回忆的线索。\n' +
          '只输出 JSON，格式：{"text":"带挖空标记的完整文本"}\n\n材料：\n{{text}}'
      }
    },
    {
      id: 'builtin.qa3',
      name: '问答 + 出处',
      icon: '📚',
      version: '1.0.0',
      apiVersion: 1,
      builtin: true,
      description: '演示插件：多字段 + 区块语法 {{#字段}}，适合考证/法规类记忆。',
      mode: 'template',
      fields: [
        { key: 'q', label: '问题', type: 'textarea', required: true },
        { key: 'a', label: '答案', type: 'textarea', required: true },
        { key: 'law', label: '出处条款', type: 'text' },
        { key: 'tags', label: '标签', type: 'tags' },
        { key: 'choices', label: '易混淆选项', type: 'list', hint: '每行一个' }
      ],
      templates: {
        front: '<div class="qa3-q">{{q}}</div>' +
          '{{#choices}}<div class="qa3-alt">{{.}}</div>{{/choices}}',
        back: '<div class="qa3-a">{{{a}}}</div>' +
          '{{#law}}<div class="qa3-law">📖 {{law}}</div>{{/law}}'
      },
      css: '.qa3-q{font-weight:600}.qa3-alt{opacity:.6;font-size:.95em;padding-left:1em}.qa3-law{color:#3b82f6;margin-top:.6em}',
      ai: {
        kind: 'cards',
        prompt: '把下面材料拆成 {{count}} 张问答卡，每张包含问题、答案、出处条款（若原文没有出处则留空）。\n' +
          '只输出 JSON：{"cards":[{"q":"问题","a":"答案","law":"出处","tags":"标签1,标签2","choices":"易混淆项"}]}\n\n材料：\n{{text}}'
      }
    }
  ];

  /* ---------------- 状态 ---------------- */
  var installed = U.Store.get(STORE_KEY, []); // [{...plugin, enabled:true}]

  function persist() { U.Store.set(STORE_KEY, installed); }

  /**
   * 插件的显示文案过一遍翻译。
   *
   * 两条路径：
   *   1. 内置插件（builtin）——文案写在 BUILTIN 里，走 T() 查 js/lang/en.js 的词典。
   *   2. 任何插件（含 plugins/*.json 示例、用户自己写的）——可选的 `i18n` 块：
   *        "i18n": { "en": {
   *            "name": "...", "description": "...",
   *            "fields": { "字段key": { "label": "...", "placeholder": "...", "hint": "..." } },
   *            "ai": { "prompt": "..." } } }
   *      一个插件可以带任意多门语言，也可以一门都不带（那就原样显示）。
   *
   * 必须在**读取时**翻译，不能在 BUILTIN 定义处直接 T()：那个数组是脚本加载时求值的，
   * 而语言是 app.js 的 init() 里才定的，写在定义处就会永远停在启动时那一门语言，
   * 用户中途切换语言也不会变。
   *
   * 只翻用户看得见的东西（名称/说明/字段标签/占位符/提示/AI 提示词），
   * 字段 key、templates、css 一律不动——那些是结构，翻了就把老卡渲染坏了。
   */
  function localize(p) {
    if (!p) return p;
    var blk = (p.i18n && p.i18n[global.I18n.lang()]) || null;
    if (!p.builtin && !blk) return p;   // 没带翻译的第三方插件：原样返回，不做无谓拷贝
    var out = Object.assign({}, p);

    if (p.builtin) {
      out.name = T(p.name);
      out.description = T(p.description);
      out.fields = (p.fields || []).map(function (f) {
        var nf = Object.assign({}, f);
        if (nf.label) nf.label = T(nf.label);
        if (nf.placeholder) nf.placeholder = T(nf.placeholder);
        if (nf.hint) nf.hint = T(nf.hint);
        if (Array.isArray(nf.options)) {
          nf.options = nf.options.map(function (o) {
            return (o && typeof o === 'object') ? Object.assign({}, o, { label: T(o.label) }) : T(o);
          });
        }
        return nf;
      });
      if (p.ai && p.ai.prompt) out.ai = Object.assign({}, p.ai, { prompt: T(p.ai.prompt) });
    }

    if (blk) {
      if (blk.name) out.name = blk.name;
      if (blk.description) out.description = blk.description;
      if (blk.fields) {
        out.fields = (out.fields || []).map(function (f) {
          var patch = blk.fields[f.key];
          if (!patch) return f;
          var nf = Object.assign({}, f, patch);
          // options 两种写法：数组 = 整组替换；对象 = 值→显示文案 的映射（只翻被点名的）
          if (patch.options && !Array.isArray(patch.options) && Array.isArray(f.options)) {
            nf.options = f.options.map(function (o) {
              var v = (o && typeof o === 'object') ? o.value : o;
              if (!Object.prototype.hasOwnProperty.call(patch.options, v)) return o;
              var lbl = patch.options[v];
              return (o && typeof o === 'object') ? Object.assign({}, o, { label: lbl }) : lbl;
            });
          }
          return nf;
        });
      }
      if (blk.ai && blk.ai.prompt) out.ai = Object.assign({}, out.ai, { prompt: blk.ai.prompt });
    }
    return out;
  }

  /** 把清单（plugins/index.json 的 examples[]）里的一条也按当前语言翻一下 */
  function localizeMeta(ex) {
    if (!ex) return ex;
    var blk = (ex.i18n && ex.i18n[global.I18n.lang()]) || null;
    return blk ? Object.assign({}, ex, blk) : ex;
  }

  function all() {
    var out = BUILTIN.map(function (b, i) {
      var override = installed.filter(function (p) { return p.id === b.id; })[0];
      var merged = localize(b);
      if (override) merged.enabled = override.enabled !== false;
      else merged.enabled = true;
      return merged;
    });
    installed.forEach(function (p) {
      if (BUILTIN.some(function (b) { return b.id === p.id; })) return;
      out.push(Object.assign(localize(p), { enabled: true }));
    });
    return out;
  }

  function enabledList() {
    return all().filter(function (p) { return p.enabled !== false; });
  }

  function get(id) {
    if (!id) return enabledList()[0] || localize(BUILTIN[0]);
    var list = all();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return localize(BUILTIN[0]);
  }

  /**
   * 这个 id 到底装没装（内置也算）。
   *
   * 别拿 get(id) 当存在性判断：get() 有「找不到就回落到第一个插件」的兜底
   * （全 App 到处都在用它取「当前卡型」），于是任何没装过的 id 都会返回一个真值。
   * 插件页的「安装 / 重新安装」按钮就是这么被误判成「重新安装」的。
   */
  function has(id) {
    if (!id) return false;
    if (BUILTIN.some(function (b) { return b.id === id; })) return true;
    return installed.some(function (p) { return p.id === id; });
  }

  function isBuiltin(id) {
    return BUILTIN.some(function (b) { return b.id === id; });
  }

  /* ---------------- 校验 ---------------- */
  function validate(p) {
    var errors = [], warnings = [];
    if (!p || typeof p !== 'object' || Array.isArray(p)) {
      return { ok: false, errors: [T('插件必须是一个 JSON 对象 { }')], warnings: [] };
    }
    if (!p.id || typeof p.id !== 'string') errors.push(T('缺少 id（字符串，唯一标识）'));
    else if (!/^[A-Za-z0-9][A-Za-z0-9._\-]{1,63}$/.test(p.id)) errors.push(T('id 只能包含字母/数字/._-，长度 2-64，且以字母或数字开头'));
    if (!p.name || typeof p.name !== 'string') errors.push(T('缺少 name（插件显示名）'));
    var api = p.apiVersion === undefined ? API_VERSION : p.apiVersion;
    if (api !== API_VERSION) errors.push(T('apiVersion 必须为 {want}（当前收到 {got}）', { want: API_VERSION, got: api }));

    var mode = p.mode || 'template';
    if (['template', 'cloze'].indexOf(mode) < 0) errors.push(T('mode 只能是 "template" 或 "cloze"'));

    if (!Array.isArray(p.fields) || !p.fields.length) errors.push(T('fields 必须是非空数组'));
    else {
      var seen = {};
      p.fields.forEach(function (f, i) {
        if (!f || typeof f !== 'object') { errors.push(T('fields[{n}] 必须是对象', { n: i })); return; }
        if (!f.key || typeof f.key !== 'string') errors.push(T('fields[{n}] 缺少 key', { n: i }));
        else if (seen[f.key]) errors.push(T('fields 中 key 重复：{key}', { key: f.key }));
        else seen[f.key] = 1;
        var t = f.type || 'text';
        if (FIELD_TYPES.indexOf(t) < 0) errors.push(T('fields[{n}].type 不支持：{type}（可用：{list}）', { n: i, type: t, list: FIELD_TYPES.join('/') }));
        if (t === 'select' && (!Array.isArray(f.options) || !f.options.length)) errors.push(T('fields[{n}] 为 select 时必须提供 options 数组', { n: i }));
      });
      if (mode === 'cloze' && !p.fields.some(function (f) { return (f.type || 'text') === 'cloze'; })) {
        errors.push(T('mode 为 "cloze" 时，fields 里必须有一个 type:"cloze" 的字段'));
      }
    }

    if (!p.templates || typeof p.templates !== 'object') errors.push(T('缺少 templates 对象（至少要有 front）'));
    else {
      if (typeof p.templates.front !== 'string' && mode === 'template') errors.push(T('templates.front 必须是字符串'));
      if (typeof p.templates.back !== 'string') warnings.push(T('没有 templates.back，背面将与正面相同'));
      var known = {};
      (p.fields || []).forEach(function (f) { if (f && f.key) known[f.key] = 1; });
      ['front', 'back'].forEach(function (side) {
        var t = p.templates[side];
        if (typeof t !== 'string') return;
        var re = /\{\{\{?\s*([#\/^]?)\s*([A-Za-z0-9_.\[\]]+)/g, m;
        while ((m = re.exec(t)) !== null) {
          // {{.}} 与 {{this}} 表示「当前区块项」，先归一化再判断
          var raw = m[2];
          var key = raw.charAt(0) === '.' ? '.' : raw.split('.')[0].split('[')[0].trim();
          if (!known[key] && ['_side', '_id', '_deck', '_tags', '.', 'this'].indexOf(key) < 0) {
            warnings.push(T('模板 {side} 引用了未声明的字段：{key}', { side: side, key: key }));
          }
        }
      });
    }

    if (p.ai !== undefined) {
      if (typeof p.ai !== 'object') errors.push(T('ai 必须是对象'));
      else {
        if (p.ai.kind && ['cards', 'cloze'].indexOf(p.ai.kind) < 0) errors.push(T('ai.kind 只能是 "cards" 或 "cloze"'));
        if (p.ai.prompt !== undefined && typeof p.ai.prompt !== 'string') errors.push(T('ai.prompt 必须是字符串'));
        if (!p.ai.prompt) warnings.push(T('没有 ai.prompt，该插件将无法使用 AI 生成'));
      }
    }
    if (p.css !== undefined && typeof p.css !== 'string') errors.push(T('css 必须是字符串'));
    if (!p.description) warnings.push(T('建议补充 description，便于在插件列表里识别'));

    return { ok: errors.length === 0, errors: errors, warnings: U.uniq(warnings) };
  }

  function normalize(p) {
    var out = U.deepClone(p);
    out.apiVersion = out.apiVersion === undefined ? API_VERSION : out.apiVersion;
    out.mode = out.mode || 'template';
    out.icon = out.icon || '🧩';
    out.version = out.version || '1.0.0';
    out.fields = (out.fields || []).map(function (f) {
      var n = Object.assign({}, f);
      n.type = n.type || 'text';
      n.label = n.label || n.key;
      return n;
    });
    out.templates = Object.assign({ front: '{{' + out.fields[0].key + '}}', back: '' }, out.templates || {});
    return out;
  }

  /* ---------------- 安装 / 卸载 ---------------- */
  function install(input, opts) {
    opts = opts || {};
    var p = typeof input === 'string' ? JSON.parse(input) : input;
    var v = validate(p);
    if (!v.ok) return { ok: false, errors: v.errors, warnings: v.warnings };
    p = normalize(p);

    if (isBuiltin(p.id) && !opts.allowBuiltinOverride) {
      // 内置插件只允许改启用状态，不覆盖定义
      var ex = installed.filter(function (x) { return x.id === p.id; })[0];
      if (!ex) { installed.push({ id: p.id, enabled: true, __shadow: true }); persist(); }
      return { ok: true, plugin: p, warnings: v.warnings.concat(['这是内置插件 id，已忽略自定义定义，仅登记启用状态']) };
    }
    var idx = -1;
    for (var i = 0; i < installed.length; i++) if (installed[i].id === p.id) { idx = i; break; }
    if (idx >= 0 && !opts.overwrite) {
      return { ok: false, errors: ['插件 id 「' + p.id + '」已存在，请勾选「覆盖安装」或修改 id'], warnings: v.warnings };
    }
    if (idx >= 0) installed[idx] = Object.assign({ enabled: true }, p);
    else installed.push(Object.assign({ enabled: true }, p));
    persist();
    return { ok: true, plugin: p, warnings: v.warnings };
  }

  function uninstall(id) {
    if (isBuiltin(id)) {
      // 内置不可删，只能禁用
      var ex = installed.filter(function (x) { return x.id === id; })[0];
      if (ex) ex.enabled = false; else installed.push({ id: id, enabled: false, __shadow: true });
      persist();
      return { ok: true, disabled: true };
    }
    installed = installed.filter(function (p) { return p.id !== id; });
    persist();
    return { ok: true };
  }

  function setEnabled(id, enabled) {
    var ex = installed.filter(function (x) { return x.id === id; })[0];
    if (ex) {
      ex.enabled = !!enabled;
    } else if (isBuiltin(id)) {
      // 内置插件用「影子条目」记录开关状态
      installed.push({ id: id, enabled: !!enabled, __shadow: true });
    } else {
      return false;   // 未安装的第三方插件无法切换开关
    }
    persist();
    return true;
  }

  /**
   * 取插件的**原始定义**，不过翻译。
   *
   * 编辑器和导出必须用这个：`get()` 返回的是「显示层」的插件（已经按当前语言翻过），
   * 把它原样存回去，等于把插件永久改成那一门语言——英文界面下点一下「保存」，
   * 中文用户再打开就变成英文了，而且看不出是谁改的。
   */
  function raw(id) {
    if (!id) return null;
    for (var i = 0; i < BUILTIN.length; i++) if (BUILTIN[i].id === id) return BUILTIN[i];
    for (var j = 0; j < installed.length; j++) if (installed[j].id === id) return installed[j];
    return null;
  }

  function exportPlugin(id) {
    // 原始定义优先；实在找不到（比如 id 是空的）再退回显示层那份
    var p = raw(id) || get(id);
    var clean = {};
    ['id', 'name', 'icon', 'version', 'apiVersion', 'description', 'author', 'homepage',
      'mode', 'fields', 'templates', 'css', 'ai', 'study', 'i18n'].forEach(function (k) {
        if (p[k] !== undefined) clean[k] = p[k];
      });
    return JSON.stringify(clean, null, 2);
  }

  /* ---------------- 字段与渲染 ---------------- */
  function defaultFields(plugin) {
    var o = {};
    (plugin.fields || []).forEach(function (f) {
      if (f.type === 'checkbox') o[f.key] = !!f.default;
      else if (f.type === 'list' || f.type === 'tags') o[f.key] = f.default || [];
      else o[f.key] = f.default || '';
    });
    return o;
  }

  function clozeFieldKey(plugin) {
    var f = (plugin.fields || []).filter(function (x) { return (x.type || 'text') === 'cloze'; })[0];
    return f ? f.key : 'text';
  }

  function cssFor(plugin) {
    var id = plugin.id.replace(/[^A-Za-z0-9_-]/g, '_');
    // 用一个包裹节点做作用域，避免插件之间互相污染
    var raw = plugin.css || '';
    if (!raw.trim()) return '';
    var scoped = raw.replace(/(^|\})\s*([^@}{]+?)\s*\{/g, function (mm, brace, sel) {
      var parts = sel.split(',').map(function (s) {
        s = s.trim();
        if (!s) return '';
        if (s.indexOf('.fc-card') === 0) return s;
        return '.fc-plugin-' + id + ' ' + s;
      }).filter(Boolean).join(',');
      return brace + ' ' + parts + ' {';
    });
    return scoped;
  }

  /**
   * 渲染卡片的一面。
   * opts（可选）会透传给 Cloze.render，用来支持「打字作答」：
   *   interactive: true  → 挖空位置渲染成输入框而不是空白
   *   typed: {编号:{given,ok}} → 展示用户打了什么、对错
   */
  function renderSide(plugin, card, side, opts) {
    opts = opts || {};
    plugin = plugin || get(card && card.pluginId);
    var fields = Object.assign({}, (card && card.fields) || {});
    // list/tags 字段统一成数组，便于 {{#f}} 区块遍历
    (plugin.fields || []).forEach(function (f) {
      if (f.type === 'list' || f.type === 'tags') {
        var v = fields[f.key];
        if (typeof v === 'string') {
          fields[f.key] = v.split(/\r?\n|,|、|;/).map(function (s) { return s.trim(); }).filter(Boolean);
        } else if (!Array.isArray(v)) fields[f.key] = [];
      } else if (f.type === 'checkbox') {
        // 统一成真布尔值，否则 {{#flag}} 会把字符串 "false" 当成真
        var b = fields[f.key];
        fields[f.key] = !(b === false || b === null || b === undefined || b === '' ||
          b === 0 || b === '0' || b === 'false');
      }
    });

    if (plugin.mode === 'cloze') {
      var key = clozeFieldKey(plugin);
      var markup = fields[key] || '';
      var html;
      if (side === 'front') {
        html = Cloze.render(markup, {
          mode: 'front', ask: (card && card.clozeIndex) || 0,
          interactive: !!opts.interactive, typed: opts.typed
        });
      } else {
        html = Cloze.render(markup, {
          mode: 'back', ask: (card && card.clozeIndex) || 0,
          interactive: false, typed: opts.typed
        });
      }
      var tpl = plugin.templates && plugin.templates[side];
      if (!tpl) return html;
      // 挖空字段无论写 {{key}} 还是 {{{key}}}，都注入已渲染好的 HTML
      var TOKEN = '\u0000CLOZE_HTML\u0000';
      var safeTpl = tpl
        .replace(new RegExp('\\{\\{\\{\\s*' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\}\\}\\}', 'g'), TOKEN)
        .replace(new RegExp('\\{\\{\\s*' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\}\\}', 'g'), TOKEN);
      var rest = Object.assign({}, fields);
      delete rest[key];
      var out = U.renderTemplate(safeTpl, Object.assign({}, rest, {
        _side: side, _id: card && card.id, _tags: (card && card.tags) || [],
        _rawText: markup, _clozeHtml: html
      }));
      return out.split(TOKEN).join(html);
    }

    var ctx = Object.assign({}, fields, {
      _side: side,
      _id: card && card.id,
      _deck: card && card.deckId,
      _tags: (card && card.tags) || [],
      _front: side === 'front'
    });
    var t = (plugin.templates && plugin.templates[side]) || '';
    if (!t && side === 'back') t = (plugin.templates && plugin.templates.front) || '';
    return U.renderTemplate(t, ctx);
  }

  /* ---------------- AI 提示词 ---------------- */
  function aiPrompt(plugin, text, count) {
    plugin = plugin || get(null);
    var ai = plugin.ai || {};
    var tpl = ai.prompt || ('请把下面材料拆成 {{count}} 张闪卡。只输出 JSON：{"cards":[]}\n\n材料：\n{{text}}');
    // 提示词必须原样嵌入文本，不能走 HTML 转义的模板引擎
    return tpl
      .replace(/\{\{\s*count\s*\}\}/g, String(count || 5))
      .replace(/\{\{\s*text\s*\}\}/g, String(text === undefined ? '' : text));
  }

  function aiKind(plugin) {
    plugin = plugin || get(null);
    if (plugin.ai && plugin.ai.kind) return plugin.ai.kind;
    return plugin.mode === 'cloze' ? 'cloze' : 'cards';
  }

  /* ============================================================
   * 给插件作者用的内置过滤器
   *   插件是纯 JSON，写不了逻辑，所以「有逻辑的展示」都得靠过滤器。
   *   这里随手注册一个通用性最强的：选择题。
   * ============================================================ */

  /**
   * 把「一行一个选项」的文本解析成 [{text, right}]。
   * 正确选项的标记写在行首：* √ ✓ ✔ [x]。
   * 用户如果自己写了 A. / A、/ (A) 前缀，先剥掉——否则会被我们
   * 再编号一次，出现「A. A. 巴黎」这种叠字。
   */
  function parseChoices(val) {
    var lines = Array.isArray(val)
      ? val.slice()
      : String(val === null || val === undefined ? '' : val).split(/\r?\n/);
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var raw = String(lines[i] === null || lines[i] === undefined ? '' : lines[i]).trim();
      if (!raw) continue;
      // 剥前缀和认正确标记要交替做最多两轮：用户可能写 "*A. 伦敦" 也可能写
      // "A. *伦敦"。只做一轮的话，后一种写法会把星号当成选项正文留在屏幕上。
      var right = false;
      for (var pass = 0; pass < 3; pass++) {
        var before = raw;
        raw = raw.replace(/^[（(]?\s*[A-Za-z]\s*[)）.、．:：]\s*/, '');
        var m = raw.match(/^(\[x\]|\[X\]|\*+|√|✓|✔)\s*/);
        if (m) { right = true; raw = raw.slice(m[0].length).trim(); }
        if (raw === before) break;
      }
      if (!raw) continue;
      out.push({ text: raw, right: right });
    }
    return out;
  }

  /**
   * {{options|mcq}}        正面：只编号，不泄露哪个对
   * {{options|mcq:back}}   背面：高亮正确项，并在下面补一行「正确答案：B」
   * {{options|mcqkey}}     只要正确项的字母，多选题会拼成「A、C」
   * 都不需要额外的条件判断——判断逻辑都在这里做完了，
   * 所以模板可以写得非常干净。
   *
   * ⚠ 改动这里的 class 名（mcq-opts / mcq-opt / mcq-k / mcq-t / mcq-mark / mcq-answer）时，
   * 要同步 plugins/04-choice.json 的 css 字段和 tools/staticcheck.js 的 REQUIRED_CLASSES。
   */
  function mcqFilter(val, mode) {
    var items = parseChoices(val);
    if (!items.length) return '';
    if (mode === 'key') {
      var ks = [];
      for (var q = 0; q < items.length; q++) if (items[q].right) ks.push(U.FILTERS.letter(q));
      return ks.join('、');
    }
    var showRight = mode === 'back';
    var rows = [];
    var anyRight = false;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var hot = showRight && it.right;
      if (it.right) anyRight = true;
      rows.push('<div class="mcq-opt' + (hot ? ' is-right' : '') + '">' +
        '<span class="mcq-k">' + U.esc(U.FILTERS.letter(i)) + '</span>' +
        '<span class="mcq-t">' + U.esc(it.text) + '</span>' +
        (hot ? '<span class="mcq-mark">✓</span>' : '') +
        '</div>');
    }
    var html = '<div class="mcq-opts">' + rows.join('') + '</div>';
    // 没标正确项时就不硬凑一行「正确答案：」，免得出现空答案
    if (showRight && anyRight) html += '<div class="mcq-answer">✅ 正确答案：<b>' + mcqFilter(val, 'key') + '</b></div>';
    return html;
  }

  U.registerFilter('mcq', mcqFilter);
  // mcqkey 是独立的名字而不是 mcq 的参数：写 {{options|mcq:key}} 也能通，
  // 但多注册一个名字更好读，而且不需要用户去猜那个参数值。
  U.registerFilter('mcqkey', function (val) { return mcqFilter(val, 'key'); });

  global.Plugins = {
    API_VERSION: API_VERSION,
    FIELD_TYPES: FIELD_TYPES,
    BUILTIN: BUILTIN,
    has: has,
    raw: raw,
    localize: localize,
    localizeMeta: localizeMeta,
    all: all, enabledList: enabledList, get: get, isBuiltin: isBuiltin,
    validate: validate, normalize: normalize,
    install: install, uninstall: uninstall, setEnabled: setEnabled, exportPlugin: exportPlugin,
    defaultFields: defaultFields, clozeFieldKey: clozeFieldKey, cssFor: cssFor,
    renderSide: renderSide, aiPrompt: aiPrompt, aiKind: aiKind,
    parseChoices: parseChoices
  };
})(window);
