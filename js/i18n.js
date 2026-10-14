/* ============================================================
 * i18n.js —— 界面语言
 *
 * 设计：**中文原文就是 key**。
 *   T('显示答案') 在中文下返回 '显示答案'（词典里没有也照样对），
 *   在英文下查 DICT.en['显示答案']，查到就用英文，查不到**回落到中文**。
 *
 * 为什么不用 foo.bar.baz 那种键：
 *   1. 这个项目原本全中文，改成键名等于把 500 多处文案全部重写一遍，
 *      而其中任何一处改错都不会报错，只会显示成别的句子——风险比收益大。
 *   2. 用原文当 key，漏翻的后果是「那一句还是中文」，是**可读的降级**，
 *      而不是 "ui.study.reveal" 这种没人看得懂的乱码。
 *   3. staticcheck 会检查每一处字面量 T('...') 都能在 DICT.en 里找到，
 *      所以「漏翻」在提交前就会被拦下，不会真的漏到用户手上。
 *
 * 只维护 DICT.en；中文词典是空的（回落即原文）。
 * ============================================================ */
(function (global) {
  'use strict';

  var LANGS = [
    { id: 'zh', label: '简体中文', english: 'Chinese (Simplified)' },
    { id: 'en', label: 'English', english: 'English' }
  ];

  var DEFAULT_LANG = 'zh';
  var DICT = { zh: {}, en: {} };
  var cur = DEFAULT_LANG;

  // 把各种写法归一到我们支持的两种；认不出来返回 ''（调用方据此走「没选过」分支）
  function normalize(id) {
    var s = String(id === null || id === undefined ? '' : id).toLowerCase().trim();
    if (!s || s === 'auto') return '';
    if (s.indexOf('zh') === 0 || s === 'cn' || s === 'chinese') return 'zh';
    if (s.indexOf('en') === 0) return 'en';
    return '';
  }

  function isSupported(id) { return normalize(id) !== ''; }

  /** 注册一份（或补充一份）语言词典。en.js 就是这么喂进来的。 */
  function register(lang, map) {
    var id = normalize(lang);
    if (!id || !map) return;
    if (!DICT[id]) DICT[id] = {};
    Object.keys(map).forEach(function (k) { DICT[id][k] = map[k]; });
  }

  function lang() { return cur; }

  /** 切换语言。返回是否真的变了（调用方据此决定要不要重绘）。 */
  function setLang(id) {
    var nid = normalize(id) || DEFAULT_LANG;
    var changed = nid !== cur;
    cur = nid;
    applyDocumentLang();
    return changed;
  }

  function applyDocumentLang() {
    try {
      // BCP-47：写进 <html lang>，读屏软件和浏览器翻译条都看这个
      document.documentElement.setAttribute('lang', cur === 'en' ? 'en' : 'zh-CN');
      document.documentElement.setAttribute('data-lang', cur);
    } catch (e) { /* 非浏览器环境（自检沙箱）忽略 */ }
  }

  /**
   * 取文案。
   *   T('取消')                        → '取消' / 'Cancel'
   *   T('本轮 完成 {done} · 重来 {n}', {done: 3, n: 1})
   * 占位符用 {名字}；找不到对应变量时**原样保留** {名字}，
   * 这样漏传参数会一眼看出来，而不是显示成 undefined。
   */
  function T(key, vars) {
    var src = String(key === null || key === undefined ? '' : key);
    var table = DICT[cur];
    var out = (table && Object.prototype.hasOwnProperty.call(table, src)) ? table[src] : src;
    if (out === null || out === undefined) out = src;
    out = String(out);
    if (vars) {
      out = out.replace(/\{(\w+)\}/g, function (m, k) {
        return (vars[k] === undefined || vars[k] === null) ? m : String(vars[k]);
      });
    }
    return out;
  }

  /** 语言自己的名字（用该语言书写），给语言选择页用 */
  function labelOf(id) {
    var nid = normalize(id);
    var hit = null;
    LANGS.forEach(function (l) { if (l.id === nid) hit = l; });
    return hit ? hit.label : '';
  }

  function englishOf(id) {
    var nid = normalize(id);
    var hit = null;
    LANGS.forEach(function (l) { if (l.id === nid) hit = l; });
    return hit ? hit.english : '';
  }

  function dict() { return DICT[cur]; }

  global.I18n = {
    LANGS: LANGS,
    DEFAULT_LANG: DEFAULT_LANG,
    normalize: normalize,
    isSupported: isSupported,
    register: register,
    lang: lang,
    setLang: setLang,
    applyDocumentLang: applyDocumentLang,
    T: T,
    labelOf: labelOf,
    englishOf: englishOf,
    dict: dict
  };
})(window);
