/* ============================================================
 * cloze.js —— 挖空引擎
 *   语法：{{c1::答案}}  或  {{c1::答案::提示}}
 *   能力：
 *     1) 解析 / 生成 markup，并维护「明文 ↔ markup」双向偏移映射
 *     2) 点词挖空（分词后用区间增删，不破坏已有挖空）
 *     3) 本地智能挖空（Intl.Segmenter 分词 + 逆文档频率打分，离线可用）
 *     4) 挖空渲染（学习正面/背面/编辑态）
 *     5) 由一段挖空文本拆卡（每空一张 / 全部一张）
 * ============================================================ */
(function (global) {
  'use strict';
  var U = global.U;

  var CLOZE_RE = /\{\{c(\d+)::([\s\S]*?)\}\}/g;

  var STOPWORDS = ('的 了 和 是 在 我 有 就 不 人 都 一 一个 上 也 很 到 说 要 去 你 会 着 没有 看 好 自己 这 那 之 与 及 或 而 但 因为 所以 如果 虽然 然而 并且 以及 可以 能够 需要 必须 应该 我们 他们 它们 他 她 它 这个 那个 这些 那些 什么 怎么 为什么 怎样 一些 一样 这样 那样 已经 还是 只是 就是 不是 但是 于是 因此 然后 现在 时候 方面 情况 问题 方式 方法 进行 通过 对于 关于 根据 由于 为了 除了 以为 觉得 认为 ' +
    'the a an of in on at to for with is are was were be been being and or but if then than that this these those it its as by from not no do does did have has had will would can could should may might must ' +
    '也 又 再 更 最 太 非常 十分 相当 比较 稍微 几乎 完全 全部 所有 任何 每个').split(/\s+/).filter(Boolean);

  var STOP = {};
  STOPWORDS.forEach(function (w) { STOP[w] = 1; STOP[w.toLowerCase()] = 1; });
  // 单字停用词（中文）
  '的了是和在与及或而之其也都很就才更最又再太被把从对向以为所'.split('').forEach(function (c) { STOP[c] = 1; });

  /* ============================================================
   * 分词（点词挖空 / 智能挖空共用）
   * 返回覆盖全文的 token 数组 [{text,start,end,word}]，start/end 为明文偏移
   * ============================================================ */
  var _seg = null;
  function getSegmenter() {
    if (_seg !== null) return _seg;
    try {
      if (typeof Intl !== 'undefined' && Intl.Segmenter) {
        _seg = new Intl.Segmenter('zh-CN', { granularity: 'word' });
      } else { _seg = false; }
    } catch (e) { _seg = false; }
    return _seg;
  }

  var CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/;

  function segmentWords(text) {
    text = String(text || '');
    var out = [];
    var seg = getSegmenter();
    if (seg) {
      var it = seg.segment(text);
      var i = 0;
      // Segmenter 的 index 是 UTF-16 偏移，与 String 一致
      if (it && typeof it[Symbol.iterator] === 'function') {
        var arr = Array.from(it);
        for (var k = 0; k < arr.length; k++) {
          var s = arr[k];
          out.push({
            text: s.segment,
            start: s.index,
            end: s.index + s.segment.length,
            word: !!s.isWordLike
          });
        }
        return out.length ? out : fallbackSegment(text);
      }
    }
    return fallbackSegment(text);
  }

  function fallbackSegment(text) {
    var out = [];
    var re = /[A-Za-z0-9_]+(?:['’\-][A-Za-z0-9_]+)*|\s+|[\s\S]/g;
    var m;
    while ((m = re.exec(text)) !== null) {
      var t = m[0];
      out.push({
        text: t,
        start: m.index,
        end: m.index + t.length,
        word: CJK.test(t) || /[A-Za-z0-9]/.test(t)
      });
      if (m.index === re.lastIndex) re.lastIndex++;
    }
    return out;
  }

  /* ============================================================
   * 解析 markup → { plain, map, spans }
   *   plain : 去掉挖空标记后的纯文本
   *   map   : 数组，map[i] = 明文第 i 个字符在 markup 中的下标
   *   spans : [{index, answer, hint, pStart, pEnd, mStart, mEnd}]
   * ============================================================ */
  function parseClozeMarkup(markup) {
    markup = String(markup === null || markup === undefined ? '' : markup);
    var plain = '';
    var map = [];
    var spans = [];
    var last = 0, m;
    CLOZE_RE.lastIndex = 0;
    while ((m = CLOZE_RE.exec(markup)) !== null) {
      var gap = markup.slice(last, m.index);
      for (var i = 0; i < gap.length; i++) map.push(last + i);
      plain += gap;

      var body = m[2];
      var parts = body.split('::');
      var answer = parts.shift();
      var hint = parts.join('::');

      var pStart = plain.length;
      // answer 在 markup 中的起点 = 匹配起点 + '{{c<idx>::'.length
      var bodyStart = m.index + ('{{c' + m[1] + '::').length;
      for (var j = 0; j < answer.length; j++) map.push(bodyStart + j);

      plain += answer;
      var pEnd = plain.length;

      spans.push({
        index: parseInt(m[1], 10) || 1,
        answer: answer,
        hint: hint,
        pStart: pStart,
        pEnd: pEnd,
        mStart: m.index,
        mEnd: CLOZE_RE.lastIndex
      });
      last = CLOZE_RE.lastIndex;
    }
    var tail = markup.slice(last);
    for (var q = 0; q < tail.length; q++) map.push(last + q);
    plain += tail;
    return { plain: plain, map: map, spans: spans };
  }

  function stripCloze(markup) { return parseClozeMarkup(markup).plain; }

  function hasCloze(markup) {
    CLOZE_RE.lastIndex = 0;
    return CLOZE_RE.test(String(markup || ''));
  }

  function maxIndex(spans) {
    var mx = 0;
    spans.forEach(function (s) { if (s.index > mx) mx = s.index; });
    return mx;
  }

  /* 明文区间 + spans → markup */
  function buildMarkup(plain, spans) {
    var list = spans.slice().sort(function (a, b) { return a.pStart - b.pStart; });
    var out = '';
    var cursor = 0;
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      var a = s.pStart, b = s.pEnd;
      if (a < cursor) continue;               // 重叠，跳过
      if (b > plain.length) b = plain.length;
      if (b <= a) continue;
      out += plain.slice(cursor, a);
      var ans = s.answer !== undefined && s.answer !== null && s.answer !== '' ? s.answer : plain.slice(a, b);
      out += '{{c' + s.index + '::' + ans + (s.hint ? '::' + s.hint : '') + '}}';
      cursor = b;
    }
    out += plain.slice(cursor);
    return out;
  }

  /* 在 markup 上「切换」一个明文区间的挖空状态 */
  function toggleClozeRange(markup, pStart, pEnd, opts) {
    opts = opts || {};
    var parsed = parseClozeMarkup(markup);
    var spans = parsed.spans;
    var hit = spans.filter(function (s) { return s.pStart < pEnd && s.pEnd > pStart; });
    if (hit.length) {
      spans = spans.filter(function (s) { return hit.indexOf(s) < 0; });
      return { markup: buildMarkup(parsed.plain, spans), action: 'removed', spans: spans };
    }
    var idx = opts.grouped ? (opts.groupIndex || 1) : (maxIndex(spans) + 1);
    var answer = parsed.plain.slice(pStart, pEnd);
    if (!answer.trim()) return { markup: markup, action: 'none', spans: spans };
    spans.push({ index: idx, answer: answer, hint: '', pStart: pStart, pEnd: pEnd });
    return { markup: buildMarkup(parsed.plain, spans), action: 'added', spans: spans };
  }

  /* ============================================================
   * 渲染
   * opts: { mode: 'front'|'back'|'edit', ask: <clozeIndex>, blankText }
   * ============================================================ */
  function renderCloze(markup, opts) {
    opts = opts || {};
    var mode = opts.mode || 'front';
    var ask = opts.ask || 0;
    var out = '';
    var last = 0, m;
    CLOZE_RE.lastIndex = 0;
    var text = String(markup === null || markup === undefined ? '' : markup);

    function blankFor(s) {
      var hint = s.hint ? '<span class="cloze-hint">' + U.esc(s.hint) + '</span>' : '';
      // 打字作答：已经答过（typed 里有这个空）就显示「你写的 + 对错」，没答过才给输入框
      var typed = opts.typed && opts.typed[s.index];
      if (typed) {
        return '<span class="cloze-typed cloze-typed--' + (typed.ok ? 'ok' : 'bad') + '">' +
          U.esc(typed.given || '（空）') + '</span>' +
          (typed.ok ? '' : '<span class="cloze-ans cloze-ans--fix">' + U.esc(s.answer) + '</span>');
      }
      if (opts.interactive) {
        return '<input class="cloze-input" type="text" data-cloze="' + s.index + '"' +
          ' autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"' +
          ' placeholder="' + U.esc(s.hint || '') + '" aria-label="第 ' + s.index + ' 个空">';
      }
      return '<span class="cloze-blank" data-cloze="' + s.index + '">' +
        '<span class="cloze-dots">' + (opts.blankText || '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;') + '</span>' + hint + '</span>';
    }

    while ((m = CLOZE_RE.exec(text)) !== null) {
      out += U.nl2br(text.slice(last, m.index));
      last = CLOZE_RE.lastIndex;
      var parts = m[2].split('::');
      var answer = parts.shift();
      var hint = parts.join('::');
      var s = { index: parseInt(m[1], 10) || 1, answer: answer, hint: hint };

      if (mode === 'edit') {
        out += '<span class="cloze-chip" data-cloze="' + s.index + '" title="点击取消挖空">' +
          '<b>c' + s.index + '</b>' + U.esc(answer) +
          (hint ? '<i>' + U.esc(hint) + '</i>' : '') + '</span>';
      } else if (mode === 'back' && (ask === 0 || s.index === ask)) {
        out += '<span class="cloze-ans' + (s.index === ask ? ' cloze-ans--ask' : '') + '">' + U.esc(answer) + '</span>';
      } else if (mode === 'front' && ask && s.index === ask) {
        out += blankFor(s);
      } else if (mode === 'front' && !ask) {
        // 未指定 ask：全部挖空
        out += blankFor(s);
      } else {
        out += U.esc(answer);
      }
    }
    out += U.nl2br(text.slice(last));
    return out;
  }

  /* ============================================================
   * 打字作答判分
   *   为什么要有：点「显示答案」是自我评估，人会骗自己；
   *   真正把答案打出来才是「回忆提取」，学习效果差别很大。
   *   判分必须宽容——中文输入法下打出全角字符、末尾多半句号，
   *   这些都不该判错，否则用户会立刻关掉这个功能。
   * ============================================================ */

  var ANSWER_ALT_SEP = /\s*[|｜]\s*/; // 一个空写多个可接受答案：{{c1::细胞|细胞质}}

  function hasCJK(s) {
    return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(s);
  }

  function normalizeAnswer(s) {
    var t = String(s === null || s === undefined ? '' : s);
    // 全角 → 半角（含全角空格），否则中文输入法下打对了也会判错
    t = t.replace(/[\uFF01-\uFF5E]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0xfee0);
    });
    t = t.replace(/\u3000/g, ' ');
    t = t.replace(/[\u2018\u2019\u201c\u201d]/g, "'");
    t = t.trim().toLowerCase();
    // 只去首尾标点，不动中间（"3.14" 不能被吃掉）
    var P = '[\\s.,;:!?\'"()\\[\\]{}、。，；：！？「」『』（）【】…·]';
    t = t.replace(new RegExp('^' + P + '+'), '').replace(new RegExp(P + '+$'), '');
    return t;
  }

  // 单个空是否算答对
  function answerMatches(given, answer) {
    var g = normalizeAnswer(given);
    if (!g) return false;
    var alts = String(answer === null || answer === undefined ? '' : answer).split(ANSWER_ALT_SEP);
    for (var i = 0; i < alts.length; i++) {
      var a = normalizeAnswer(alts[i]);
      if (!a) continue;
      if (g === a) return true;
      // 中日韩没有词间空格，忽略空格差异；英文不忽略（"power house" ≠ "powerhouse"）
      if (hasCJK(a) && g.replace(/\s+/g, '') === a.replace(/\s+/g, '')) return true;
    }
    return false;
  }

  /**
   * 判分。values: { 挖空编号: 用户输入 }，返回每个空的结果数组。
   * 返回项：{ index, answer, hint, given, ok }
   */
  function checkTyping(markup, values) {
    values = values || {};
    var spans = parseClozeMarkup(markup).spans;
    return spans.map(function (s) {
      var raw = values[s.index];
      var given = raw === undefined || raw === null ? '' : String(raw);
      return {
        index: s.index,
        answer: s.answer,
        hint: s.hint,
        given: given,
        ok: answerMatches(given, s.answer)
      };
    });
  }

  // 把 checkTyping 的结果转成 render 的 typed 参数形态 { index: {given, ok} }
  function toTypedMap(results) {
    var out = {};
    (results || []).forEach(function (r) { out[r.index] = { given: r.given, ok: r.ok }; });
    return out;
  }

  /* ============================================================
   * 智能挖空（离线）：分词 + IDF 打分
   * opts: { count, perSentence, mode:'local', minLen, grouped }
   * ============================================================ */
  function splitSentences(text) {
    var out = [];
    var start = 0;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (ch === '\n' || ch === '。' || ch === '！' || ch === '？' || ch === '!' || ch === '?' || ch === '；' || ch === ';') {
        if (i + 1 > start) out.push({ start: start, end: i + 1, text: text.slice(start, i + 1) });
        start = i + 1;
      }
    }
    if (start < text.length) out.push({ start: start, end: text.length, text: text.slice(start) });
    return out.filter(function (s) { return s.text.trim().length > 1; });
  }

  function tokenizeForCandidates(text) {
    var toks = segmentWords(text);
    var out = [];
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (!t.word) continue;
      var s = t.text.trim();
      if (!s) continue;
      var isAscii = /^[A-Za-z0-9]/.test(s);
      var len = s.length;
      if (isAscii) { if (len < 3) continue; }
      else { if (len < 2) continue; }
      if (STOP[s] || STOP[s.toLowerCase()]) continue;
      if (/^[\d\s\p{P}]+$/u.test(s)) continue;
      out.push({ text: s, start: t.start, end: t.end });
    }
    return out;
  }

  function localAutoCloze(text, opts) {
    opts = opts || {};
    var total = Math.max(1, opts.count || 3);
    text = String(text || '');
    if (!text.trim()) return { markup: text, spans: [] };

    var sentences = splitSentences(text);
    var allToks = tokenizeForCandidates(text);

    // 全局词频 → IDF
    var freq = {};
    allToks.forEach(function (t) { freq[t.text] = (freq[t.text] || 0) + 1; });
    var N = Math.max(1, sentences.length);

    // 每个句子内的候选
    var perSentence = [];
    sentences.forEach(function (sent, si) {
      var cands = allToks.filter(function (t) { return t.start >= sent.start && t.end <= sent.end; });
      cands.forEach(function (c) {
        var df = freq[c.text] || 1;
        var score = Math.log(1 + N / df) * 1.0                // 稀有度
          + Math.min(c.text.length, 6) * 0.35                 // 长度（信息量）
          + (/[0-9]/.test(c.text) ? 0.9 : 0)                  // 数字/年份
          + (/^[A-Za-z]/.test(c.text) ? 0.5 : 0)              // 英文术语
          + (si === perSentence.length ? 0 : 0)
          - (c.start === sent.start ? 0.6 : 0);               // 句首常为连接词
        c.score = score;
      });
      cands.sort(function (a, b) { return b.score - a.score; });
      perSentence.push({ sent: sent, cands: cands });
    });

    // 按总分从高到低分配名额：优先每句 1 个，再补足总数
    var picked = [];
    var perSentenceQuota = opts.perSentence || 1;
    var used = {};
    var guard = 0;
    var counts = perSentence.map(function () { return 0; });

    function tryPick(si) {
      var bucket = perSentence[si];
      if (!bucket) return false;
      for (var i = 0; i < bucket.cands.length; i++) {
        var c = bucket.cands[i];
        var key = c.start + ':' + c.end;
        if (used[key]) continue;
        var ov = picked.some(function (p) { return p.start < c.end && p.end > c.start; });
        if (ov) continue;
        used[key] = 1;
        picked.push({ start: c.start, end: c.end, text: c.text, score: c.score, sent: si });
        counts[si]++;
        return true;
      }
      return false;
    }

    // 第一轮：每句最多 perSentenceQuota 个
    for (var r = 0; r < perSentenceQuota && picked.length < total; r++) {
      for (var i = 0; i < perSentence.length && picked.length < total; i++) tryPick(i);
    }
    // 第二轮：补足剩余名额
    while (picked.length < total && guard++ < 500) {
      var bestSi = -1, bestScore = -Infinity;
      for (var j = 0; j < perSentence.length; j++) {
        var candsLeft = perSentence[j].cands.filter(function (c) {
          return !used[c.start + ':' + c.end] && !picked.some(function (p) { return p.start < c.end && p.end > c.start; });
        });
        if (!candsLeft.length) continue;
        if (candsLeft[0].score > bestScore) { bestScore = candsLeft[0].score; bestSi = j; }
      }
      if (bestSi < 0) break;
      if (!tryPick(bestSi)) break;
    }

    picked.sort(function (a, b) { return a.start - b.start; });
    var spans = picked.map(function (p, i) {
      return {
        index: opts.grouped ? (i + 1) : (i + 1),
        answer: text.slice(p.start, p.end),
        hint: '',
        pStart: p.start,
        pEnd: p.end
      };
    });
    return { markup: buildMarkup(text, spans), spans: spans };
  }

  /* ============================================================
   * 由挖空文本生成卡片
   * opts: { oneCardPerBlank: true, extra: '' }
   * ============================================================ */
  function clozeToCards(markup, opts) {
    opts = opts || {};
    var parsed = parseClozeMarkup(markup);
    var spans = parsed.spans;
    if (!spans.length) return [];
    var out = [];
    if (opts.oneCardPerBlank === false) {
      out.push({ clozeIndex: 0, fields: { text: markup, extra: opts.extra || '' } });
    } else {
      var seen = {};
      spans.forEach(function (s) {
        if (seen[s.index]) return;
        seen[s.index] = 1;
        out.push({ clozeIndex: s.index, fields: { text: markup, extra: opts.extra || '' } });
      });
    }
    return out;
  }

  global.Cloze = {
    RE: CLOZE_RE,
    parse: parseClozeMarkup,
    strip: stripCloze,
    hasCloze: hasCloze,
    maxIndex: maxIndex,
    build: buildMarkup,
    toggle: toggleClozeRange,
    render: renderCloze,
    segmentWords: segmentWords,
    splitSentences: splitSentences,
    localAuto: localAutoCloze,
    toCards: clozeToCards,
    normalizeAnswer: normalizeAnswer,
    answerMatches: answerMatches,
    checkTyping: checkTyping,
    toTypedMap: toTypedMap,
    hasCJK: hasCJK,
    STOPWORDS: STOP
  };
})(window);
