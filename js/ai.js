/* ============================================================
 * ai.js —— AI 挖空 / AI 生成卡片
 *   走 OpenAI 兼容的 /chat/completions 接口，任何兼容服务都能接：
 *   OpenAI、DeepSeek、Moonshot、智谱、通义、SiliconFlow、Ollama、LM Studio…
 *   接口不可用时自动回退到本地智能挖空（离线可用）。
 * ============================================================ */
(function (global) {
  'use strict';
  var U = global.U;
  var DB = global.DB;
  var Plugins = global.Plugins;
  var Cloze = global.Cloze;

  function cfg() { return DB.getSettings().ai; }

  function normalizeBaseUrl(url) {
    url = String(url || '').trim().replace(/\/+$/, '');
    if (!url) return '';
    if (/\/chat\/completions$/.test(url)) return url;
    if (/\/v\d+$/.test(url)) return url + '/chat/completions';
    return url + '/v1/chat/completions';
  }

  /* ---------------- 底层请求 ---------------- */
  /**
   * 发一次 POST。
   * APK 里页面是从虚拟域名 https://appassets.androidplatform.net 加载的，
   * 直连第三方 API 属于跨源请求，会被 CORS 拦在门外（很多服务不返回
   * Access-Control-Allow-Origin）。所以只要原生侧提供了 httpRequest 桥，
   * 就走原生发请求——原生没有同源策略，也就不存在 CORS 问题。
   * 桥不存在（纯浏览器里跑）或桥自身出错时，自动回落到 fetch。
   *
   * 返回值统一成 { status, text } 或 { transportError }，调用方不用关心走的哪条路。
   */
  function doRequest(endpoint, headers, bodyStr, timeoutMs) {
    var nat = global.FlashCardsNative;
    if (nat && typeof nat.httpRequest === 'function') {
      return new Promise(function (resolve) {
        var raw;
        try {
          raw = nat.httpRequest(endpoint, 'POST', JSON.stringify(headers), bodyStr, timeoutMs);
        } catch (e) {
          resolve({ transportError: '原生请求抛错：' + ((e && e.message) || String(e)) });
          return;
        }
        var r;
        try { r = JSON.parse(String(raw)); }
        catch (e) {
          resolve({ transportError: '原生返回不是 JSON：' + String(raw).slice(0, 200) });
          return;
        }
        if (!r || !r.ok) {
          resolve({ transportError: (r && r.error) || '原生请求失败' });
          return;
        }
        resolve({ status: r.status || 0, text: r.body || '' });
      });
    }

    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, timeoutMs);
    return fetch(endpoint, {
      method: 'POST',
      headers: headers,
      body: bodyStr,
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      clearTimeout(timer);
      return res.text().then(function (t) { return { status: res.status, text: t }; });
    }).catch(function (err) {
      clearTimeout(timer);
      var msg = err && err.name === 'AbortError' ? '请求超时' : (err && err.message) || String(err);
      return { transportError: msg };
    });
  }

  function chat(messages, opts) {
    opts = opts || {};
    if (opts._noJsonMode) { /* 内部重试标记，不再附加 response_format */ }
    var c = cfg();
    var base = c.baseUrl;
    if (!base) return Promise.resolve({ ok: false, error: '未配置 API 地址', code: 'noconfig' });
    if (!c.apiKey && !/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(base)) {
      return Promise.resolve({ ok: false, error: '未配置 API Key', code: 'nokey' });
    }
    var endpoint = normalizeBaseUrl(base);
    var body = {
      model: opts.model || c.model || 'gpt-4o-mini',
      messages: messages,
      temperature: opts.temperature === undefined ? (c.temperature === undefined ? 0.3 : c.temperature) : opts.temperature
    };
    if (c.jsonMode !== false && opts.json !== false && !opts._noJsonMode) body.response_format = { type: 'json_object' };

    var headers = { 'Content-Type': 'application/json' };
    if (c.apiKey) headers['Authorization'] = 'Bearer ' + c.apiKey;
    if (c.extraHeaders && typeof c.extraHeaders === 'object') {
      Object.keys(c.extraHeaders).forEach(function (k) { headers[k] = c.extraHeaders[k]; });
    }

    return doRequest(endpoint, headers, JSON.stringify(body), c.timeoutMs || 90000).then(function (r) {
      if (r.transportError) {
        var msg = r.transportError;
        var hint = '';
        if (/Failed to fetch|NetworkError|Load failed|超时|timeout/i.test(msg)) {
          hint = '（常见原因：① 没联网；② 地址或 Key 写错；③ 服务端连不上。' +
            '页面里直连第三方 API 还可能被 CORS 拦——APK 里已改走原生请求，不该再有这个问题。）';
        }
        return { ok: false, error: '网络错误：' + msg + hint, code: 'network' };
      }
      var raw = r.text;
      if (r.status < 200 || r.status >= 300) {
        var detail = raw;
        try { var j = JSON.parse(raw); detail = (j.error && (j.error.message || j.error)) || raw; } catch (e) { }
        // 某些服务不支持 response_format，去掉后重试一次
        if (r.status === 400 && body.response_format) {
          return chat(messages, Object.assign({}, opts, { _noJsonMode: true }));
        }
        return { ok: false, error: 'HTTP ' + r.status, detail: String(detail).slice(0, 500), code: 'http' };
      }
      var data;
      try { data = JSON.parse(raw); }
      catch (e) { return { ok: false, error: '返回不是合法 JSON', detail: raw.slice(0, 500), code: 'badjson' }; }
      var content =
        (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) ||
        (data.choices && data.choices[0] && data.choices[0].text) ||
        (data.message && data.message.content) || '';
      if (!content) return { ok: false, error: '返回内容为空', detail: JSON.stringify(data).slice(0, 500), code: 'empty' };
      return { ok: true, content: content, raw: data };
    });
  }

  /* ---------------- JSON 抽取 ---------------- */
  function extractJSON(text) {
    if (!text) return null;
    var s = String(text).trim();
    // 去掉 ```json ... ``` 围栏
    var fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) s = fence[1].trim();
    // 直接解析
    try { return JSON.parse(s); } catch (e) { }
    // 截取最外层 { } 或 [ ]
    var first = s.search(/[{[]/);
    if (first >= 0) {
      var open = s[first];
      var close = open === '{' ? '}' : ']';
      var depth = 0, inStr = false, escNext = false;
      for (var i = first; i < s.length; i++) {
        var ch = s[i];
        if (inStr) {
          if (escNext) { escNext = false; continue; }
          if (ch === '\\') { escNext = true; continue; }
          if (ch === '"') inStr = false;
          continue;
        }
        if (ch === '"') { inStr = true; continue; }
        if (ch === open) depth++;
        else if (ch === close) {
          depth--;
          if (depth === 0) {
            try { return JSON.parse(s.slice(first, i + 1)); } catch (e2) { break; }
          }
        }
      }
    }
    return null;
  }

  /* ---------------- AI 挖空 ---------------- */
  function aiCloze(text, count, pluginId) {
    var plugin = Plugins.get(pluginId || 'builtin.cloze');
    var prompt = Plugins.aiPrompt(plugin, text, count);
    return chat([
      { role: 'system', content: '你是闪卡挖空助手。严格遵守用户的格式要求，只输出 JSON，不要任何解释性文字。' },
      { role: 'user', content: prompt }
    ]).then(function (res) {
      if (!res.ok) return res;
      var data = extractJSON(res.content);
      if (!data) return { ok: false, error: 'AI 返回的内容无法解析为 JSON', detail: String(res.content).slice(0, 400), code: 'parse' };
      var out = data.text || data.cloze || data.result ||
        (Array.isArray(data.cards) && data.cards[0] && (data.cards[0].text || data.cards[0].cloze)) || '';
      if (!out || !Cloze.hasCloze(out)) {
        return { ok: false, error: 'AI 没有产出有效的挖空标记 {{c1::…}}', detail: String(res.content).slice(0, 400), code: 'noCloze' };
      }
      return { ok: true, markup: String(out), source: 'ai' };
    });
  }

  /* ---------------- AI 生成卡片（任意插件字段） ---------------- */
  function aiCards(text, count, pluginId) {
    var plugin = Plugins.get(pluginId || 'builtin.basic');
    var prompt = Plugins.aiPrompt(plugin, text, count);
    return chat([
      { role: 'system', content: '你是闪卡制作助手。严格遵守字段要求，只输出 JSON，不要任何解释性文字。' },
      { role: 'user', content: prompt }
    ]).then(function (res) {
      if (!res.ok) return res;
      var data = extractJSON(res.content);
      if (!data) return { ok: false, error: 'AI 返回的内容无法解析为 JSON', detail: String(res.content).slice(0, 400), code: 'parse' };
      var arr = Array.isArray(data) ? data : (data.cards || data.items || data.data || []);
      if (!Array.isArray(arr) || !arr.length) return { ok: false, error: 'AI 没有返回卡片数组', detail: String(res.content).slice(0, 400), code: 'noCards' };
      var keys = (plugin.fields || []).map(function (f) { return f.key; });
      var out = arr.map(function (item) { return mapItemToFields(item, keys); })
        .filter(function (f) {
          return Object.keys(f).some(function (k) { return String(f[k]).trim(); });
        });
      return { ok: true, cards: out, source: 'ai' };
    });
  }

  /* ---------------- AI 拆卡（治「难卡」） ---------------- */
  /**
   * 把一张「太胖」的卡拆成 2~4 张更小的卡。
   * 一张卡被反复答错，绝大多数时候不是记不住，而是这张卡同时要求
   * 回忆好几条互不相关的信息——拆开才是解法，继续硬刷没有用。
   * 返回 { ok, cards:[字段对象], source }，走 aiCards 的字段映射规则。
   */
  function aiSplitCard(plugin, fields) {
    plugin = plugin || Plugins.get('builtin.basic');
    var keys = (plugin.fields || []).map(function (f) { return f.key; });
    var lines = keys.map(function (k) {
      var v = fields[k];
      if (Array.isArray(v)) v = v.join('; ');
      return '- ' + k + ': ' + String(v === undefined || v === null ? '' : v);
    }).join('\n');
    var fieldsDoc = (plugin.fields || []).map(function (f) {
      return '  ' + f.key + ' (' + (f.label || f.key) + ', ' + f.type + ')' + (f.required ? ' 必填' : '');
    }).join('\n');

    var prompt = '下面是一张「难卡」（学习者反复答错）。请把它拆成 2~4 张更简单的卡，' +
      '每张只考一个知识点。\n\n' +
      '字段定义：\n' + fieldsDoc + '\n\n' +
      '原卡片内容：\n' + lines + '\n\n' +
      '要求：\n' +
      '1. 只输出 JSON，形如 {"cards":[{"字段key":"值"}, ...]}，不要任何解释文字。\n' +
      '2. 每个对象都要包含全部字段 key，用不到就填空字符串。\n' +
      '3. 拆出来的卡必须一个个都考得住：一张卡问一件事实，不要互相重复，也不要把原卡原样复制一遍。\n' +
      '4. 如果这张卡其实已经足够简单、不该拆，就返回 {"cards":[]}。\n' +
      (plugin.mode === 'cloze'
        ? '5. 这是挖空卡：挖空写在 text 字段里，用 {{c1::答案}} 语法，编号从 c1 连续递增。\n'
        : '');

    return chat([
      { role: 'system', content: '你是闪卡制作助手。只输出 JSON。' },
      { role: 'user', content: prompt }
    ]).then(function (res) {
      if (!res.ok) return res;
      var data = extractJSON(res.content);
      if (!data) return { ok: false, error: 'AI 返回的内容无法解析为 JSON', detail: String(res.content).slice(0, 400), code: 'parse' };
      var arr = Array.isArray(data) ? data : (data.cards || data.items || data.data || []);
      if (!Array.isArray(arr)) return { ok: false, error: 'AI 没有返回卡片数组', detail: String(res.content).slice(0, 400), code: 'noCards' };
      var out = arr.map(function (item) { return mapItemToFields(item, keys); })
        .filter(function (f) { return Object.keys(f).some(function (k) { return String(f[k]).trim(); }); });
      return { ok: true, cards: out, source: 'ai' };
    });
  }

  /* 把模型返回的一个对象映射成插件的字段集（AI 生成 / AI 拆卡共用） */
  function mapItemToFields(item, keys) {
    var fields = {};
    keys.forEach(function (k) {
      var v = item[k];
      if (v === undefined || v === null) v = '';
      if (Array.isArray(v)) v = v.join('\n');
      else if (typeof v === 'object') v = JSON.stringify(v);
      fields[k] = String(v);
    });
    // 兜底：模型用了别的字段名
    if (!fields[keys[0]] && !fields[keys[1] || keys[0]]) {
      var vals = Object.keys(item).map(function (k) { return item[k]; })
        .filter(function (v) { return v !== '' && v !== null; });
      keys.forEach(function (k, i) { if (!fields[k] && vals[i] !== undefined) fields[k] = String(vals[i]); });
    }
    return fields;
  }

  /* ---------------- 统一入口（AI 失败自动本地回退） ---------------- */
  function generate(text, opts) {
    opts = opts || {};
    var count = opts.count || 3;
    var pluginId = opts.pluginId;
    var plugin = Plugins.get(pluginId);
    var kind = opts.kind || Plugins.aiKind(plugin);

    if (opts.engine === 'local') {
      return Promise.resolve(localGenerate(text, count, plugin, kind));
    }
    if (kind === 'cloze') {
      return aiCloze(text, count, pluginId).then(function (r) {
        if (!r.ok && opts.fallbackLocal !== false) {
          var l = localGenerate(text, count, plugin, 'cloze');
          l.fallback = true; l.aiError = r.error;
          return l;
        }
        return r;
      });
    }
    return aiCards(text, count, pluginId).then(function (r) {
      if (!r.ok && opts.fallbackLocal !== false && plugin.mode === 'cloze') {
        var l = localGenerate(text, count, plugin, 'cloze');
        l.fallback = true; l.aiError = r.error;
        return l;
      }
      return r;
    });
  }

  function localGenerate(text, count, plugin, kind) {
    if (kind === 'cloze' || (plugin && plugin.mode === 'cloze')) {
      var r = Cloze.localAuto(text, { count: count });
      return { ok: true, markup: r.markup, source: 'local' };
    }
    // 非挖空卡型：本地按句子切分，第一句当正面其余当背面
    var sents = Cloze.splitSentences(text).map(function (s) { return s.text.trim(); }).filter(Boolean);
    // plugin 理论上一定带 fields，但这里是被 fallback 路径调用的，
    // 兜一层，免得插件数据异常时整个「离线回退」跟着炸掉。
    var fields = (plugin && Array.isArray(plugin.fields) && plugin.fields.length)
      ? plugin.fields
      : [{ key: 'text' }, { key: 'extra' }];
    var keys = fields.map(function (f) { return f.key; });
    var cards = [];
    for (var i = 0; i < sents.length && cards.length < count; i++) {
      var f = {};
      keys.forEach(function (k) { f[k] = ''; });
      f[keys[0]] = sents[i];
      if (keys[1]) f[keys[1]] = sents[i + 1] || '（本地模式无法自动提炼答案，请手动补全）';
      cards.push(f);
      if (keys[1]) i++;
    }
    return { ok: true, cards: cards, source: 'local' };
  }

  /* ---------------- 连接测试 ---------------- */
  function test() {
    return chat([{ role: 'user', content: '回复一个 JSON：{"ok":true}' }], { json: true, temperature: 0 })
      .then(function (r) {
        if (!r.ok) return r;
        return { ok: true, echo: String(r.content).slice(0, 200) };
      });
  }

  global.AI = {
    chat: chat,
    normalizeBaseUrl: normalizeBaseUrl,
    extractJSON: extractJSON,
    aiCloze: aiCloze,
    aiCards: aiCards,
    aiSplitCard: aiSplitCard,
    mapItemToFields: mapItemToFields,
    generate: generate,
    localGenerate: localGenerate,
    test: test
  };
})(window);
