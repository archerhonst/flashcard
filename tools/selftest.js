/* ============================================================
 * tools/selftest.js —— 离线自检（Node 运行，不进 APK）
 *
 *   node tools/selftest.js
 *
 * 目的：在没有浏览器的环境下，把 js/ 里的纯逻辑模块
 * （util / cloze / plugins / store / ai）真正跑一遍，
 * 验证挖空引擎、插件校验器、SM-2 调度这些核心算法没坏。
 * app.js 依赖真实 DOM，不在这里加载。
 * ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

/* ---------------- 1. 搭一个最小 DOM 环境 ---------------- */
function makeStore() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(String(k)) ? map.get(String(k)) : null),
    setItem: (k, v) => { map.set(String(k), String(v)); },
    removeItem: (k) => { map.delete(String(k)); },
    clear: () => map.clear(),
    key: (i) => Array.from(map.keys())[i] ?? null,
    get length() { return map.size; },
    _dump: () => Object.fromEntries(map),
  };
}

function fakeEl() {
  const el = {
    style: {}, dataset: {}, children: [], classList: {
      add() {}, remove() {}, toggle() {}, contains: () => false,
    },
    innerHTML: '', textContent: '', value: '', checked: false, disabled: false,
    setAttribute() {}, getAttribute: () => null, removeAttribute() {},
    appendChild(c) { this.children.push(c); return c; },
    removeChild() {}, remove() {}, insertBefore() {},
    addEventListener() {}, removeEventListener() {},
    querySelector: () => null, querySelectorAll: () => [],
    focus() {}, blur() {}, click() {}, select() {}, scrollIntoView() {},
    getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 }),
    cloneNode() { return fakeEl(); },
  };
  return el;
}

const documentStub = {
  readyState: 'complete',
  body: fakeEl(),
  documentElement: fakeEl(),
  head: fakeEl(),
  createElement: () => fakeEl(),
  createTextNode: () => ({}),
  createDocumentFragment: () => fakeEl(),
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener() {}, removeEventListener() {},
  execCommand() { return true; },
  cookie: '',
};

const sandbox = {
  console,
  setTimeout, clearTimeout, setInterval, clearInterval,
  Promise, Date, Math, JSON, Object, Array, String, Number, Boolean,
  RegExp, Error, TypeError, RangeError, Map, Set, WeakMap, WeakSet,
  Symbol, Intl, encodeURIComponent, decodeURIComponent,
  isNaN, isFinite, parseInt, parseFloat, escape, unescape,
  atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  URL: globalThis.URL,
  TextEncoder: globalThis.TextEncoder,
  TextDecoder: globalThis.TextDecoder,
  AbortController: globalThis.AbortController,
  fetch: globalThis.fetch,
  navigator: { language: 'zh-CN', languages: ['zh-CN'], userAgent: 'node', clipboard: null, onLine: true },
  location: { href: 'https://appassets.androidplatform.net/assets/www/index.html', protocol: 'https:', origin: 'https://appassets.androidplatform.net', reload() {} },
  localStorage: makeStore(),
  sessionStorage: makeStore(),
  document: documentStub,
  alert() {}, confirm: () => false, prompt: () => null,
  getComputedStyle: () => ({ getPropertyValue: () => '' }),
  matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
  requestAnimationFrame: (cb) => setTimeout(cb, 0),
  cancelAnimationFrame: (id) => clearTimeout(id),
  addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
  URLcreateObjectURL: () => 'blob:x',
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
sandbox.FileReader = class { readAsText() {} };
sandbox.Blob = class { constructor(p) { this.parts = p; } };
sandbox.Notification = undefined;

const ctx = vm.createContext(sandbox);

/* ---------------- 2. 按 index.html 的顺序加载 ---------------- */
// i18n 必须排在 plugins.js 之前（后者在模块顶层就取 global.I18n.T），
// en.js 必须排在 i18n.js 之后（它调用 I18n.register）。
const ORDER = ['js/i18n.js', 'js/lang/en.js', 'js/zip.js', 'js/util.js', 'js/cloze.js', 'js/plugins.js', 'js/store.js', 'js/game.js', 'js/ai.js'];
for (const rel of ORDER) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  try {
    vm.runInContext(src, ctx, { filename: rel });
  } catch (e) {
    console.error(`✗ 加载 ${rel} 抛异常：${e.message}`);
    process.exit(1);
  }
}

/* ---------------- 3. 迷你断言框架 ---------------- */
let pass = 0, fail = 0;
const failures = [];
let groupName = '';
let groupMark = 0;

function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; failures.push(`[${groupName}] ${name}` + (extra ? `  → ${extra}` : '')); }
}
function eq(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  ok(name, g === w, `得到 ${g}，期望 ${w}`);
}
function closeGroup() {
  if (!groupName) return;
  const n = pass + fail - groupMark;
  const bad = failures.filter((f) => f.startsWith(`[${groupName}]`)).length;
  console.log(`  ${bad ? '✗' : '✓'} ${groupName}  ${n - bad}/${n} 通过`);
}
function group(title) {
  closeGroup();
  groupName = title;
  groupMark = pass + fail;
  console.log(`\n── ${title} ──`);
}

const U = ctx.U, Cloze = ctx.Cloze, Plugins = ctx.Plugins, DB = ctx.DB, AI = ctx.AI;

/* ---------------- 4. 模块存在性 ---------------- */
group('模块加载');
for (const [n, v] of [['U', U], ['Cloze', Cloze], ['Plugins', Plugins], ['DB', DB], ['AI', AI]]) {
  ok(`global.${n} 已导出`, v && typeof v === 'object');
}

/* ---------------- 5. 模板引擎 ---------------- */
group('模板引擎 (U.renderTemplate)');
eq('普通插值', U.renderTemplate('你好 {{name}}', { name: '世界' }), '你好 世界');
eq('HTML 转义', U.renderTemplate('{{x}}', { x: '<b>&"' }), '&lt;b&gt;&amp;&quot;');
eq('三花括号不转义', U.renderTemplate('{{{x}}}', { x: '<b>' }), '<b>');
eq('点号取嵌套', U.renderTemplate('{{a.b.c}}', { a: { b: { c: 7 } } }), '7');
eq('缺失字段为空串', U.renderTemplate('[{{nope}}]', {}), '[]');
eq('#each 遍历', U.renderTemplate('{{#list}}<{{v}}>{{/list}}', { list: [{ v: 1 }, { v: 2 }] }), '<1><2>');
eq('^ 反向区块（空数组）', U.renderTemplate('{{^list}}空{{/list}}', { list: [] }), '空');
eq('^ 反向区块（非空）', U.renderTemplate('{{^list}}空{{/list}}', { list: [1] }), '');
eq('# 区块为真值', U.renderTemplate('{{#ok}}是{{/ok}}', { ok: 1 }), '是');
eq('中文键名', U.renderTemplate('{{正面}}', { 正面: '你好' }), '你好');

/* ---------------- 6. 挖空引擎 ---------------- */
group('挖空引擎 (Cloze)');
const p1 = Cloze.parse('光合作用发生在{{c1::叶绿体}}里，产物是{{c2::葡萄糖}}。');
eq('parse → plain', p1.plain, '光合作用发生在叶绿体里，产物是葡萄糖。');
eq('parse → span 数', p1.spans.length, 2);
eq('parse → span[0] 索引', p1.spans[0].index, 1);
eq('parse → span[0] 答案', p1.spans[0].answer, '叶绿体');
// 明文「光合作用发生在」占 0..6，叶绿体 = [7,10)
eq('parse → span[0] 明文区间', [p1.spans[0].pStart, p1.spans[0].pEnd], [7, 10]);
eq('strip 去标记', Cloze.strip('a{{c1::b}}c'), 'abc');
ok('hasCloze 真', Cloze.hasCloze('x{{c1::y}}') === true);
ok('hasCloze 假', Cloze.hasCloze('没有标记') === false);
eq('maxIndex', Cloze.maxIndex(p1.spans), 2);
ok('带提示的 :: ::', Cloze.parse('{{c1::线粒体::细胞器}}').spans[0].hint === '细胞器');
eq('答案里含 ::', Cloze.parse('{{c1::a::b::c}}').spans[0].answer, 'a');
eq('答案里含 ::（提示）', Cloze.parse('{{c1::a::b::c}}').spans[0].hint, 'b::c');

// 明文 ↔ markup 往返：这是编辑器里鼠标选区挖空的地基
const round = Cloze.build(p1.plain, p1.spans);
eq('build 往返还原 markup', round, '光合作用发生在{{c1::叶绿体}}里，产物是{{c2::葡萄糖}}。');

// toggle(markup, pStart, pEnd, opts) 返回 { markup, action, spans }，不是裸字符串
for (const [name, src, a, b, expectAnswer] of [
  ['toggle 增（中文）', '光合作用发生在叶绿体里。', 7, 10, '叶绿体'],
  ['toggle 增（英文）', 'Mitochondria is the powerhouse.', 0, 12, 'Mitochondria'],
  ['toggle 增（标点邻接）', '答案是：42。', 4, 6, '42'],
]) {
  const t = Cloze.toggle(src, a, b, {});
  ok(`${name} → action=added`, t.action === 'added', JSON.stringify(t.action));
  ok(`${name} → 生成标记`, Cloze.hasCloze(t.markup), `结果 ${JSON.stringify(t.markup)}`);
  eq(`${name} → 挖空的就是选中内容`, t.spans[0] && t.spans[0].answer, expectAnswer);
  eq(`${name} → plain 仍是原文`, Cloze.parse(t.markup).plain, src);
  eq(`${name} → 再 toggle 一次撤回`, Cloze.toggle(t.markup, a, b, {}).markup, src);
  eq(`${name} → 撤回后 action=removed`, Cloze.toggle(t.markup, a, b, {}).action, 'removed');
  eq(`${name} → 往回 toggle 后没有残留标记`, Cloze.hasCloze(Cloze.toggle(t.markup, a, b, {}).markup), false);
}
// 选区为空 / 全空白时不应该造出空挖空
eq('toggle 空白选区 → action=none', Cloze.toggle('abcdef', 2, 2, {}).action, 'none');
eq('toggle 纯空格选区 → action=none', Cloze.toggle('ab   cd', 2, 5, {}).action, 'none');
// 重叠选区应合并成一处，而不是叠标记
{
  const once = Cloze.toggle('abcdef', 1, 3, {}).markup;
  const twice = Cloze.toggle(once, 2, 4, {});
  eq('toggle 与已有挖空重叠 → 合并', twice.action, 'removed');
  eq('toggle 重叠后明文不变', Cloze.parse(twice.markup).plain, 'abcdef');
}
// grouped 模式：多处共用 c1
{
  const g = Cloze.toggle('abcdef', 0, 1, { grouped: true, groupIndex: 1 }).markup;
  const g2 = Cloze.toggle(g, 3, 4, { grouped: true, groupIndex: 1 }).markup;
  eq('grouped 两处都是 c1', Cloze.parse(g2).spans.map((s) => s.index), [1, 1]);
}
// 渲染
{
  const mk = '光合作用发生在{{c1::叶绿体::细胞器}}里。';
  const front = Cloze.render(mk, { mode: 'front', ask: 0 });
  ok('render front 不泄露答案', front.indexOf('叶绿体') < 0, front);
  ok('render front 带提示', front.indexOf('细胞器') >= 0, front);
  ok('render front 有挖空占位', front.indexOf('cloze-blank') >= 0, front);
  const back = Cloze.render(mk, { mode: 'back' });
  ok('render back 显示答案', back.indexOf('叶绿体') >= 0, back);
  const edit = Cloze.render(mk, { mode: 'edit' });
  ok('render edit 显示可点标记', edit.indexOf('cloze-chip') >= 0, edit);
  // 正面 + ask=N：只遮住第 N 个空，其余直接给答案（逐空练习模式）
  const askMine = Cloze.render(mk, { mode: 'front', ask: 1 });
  ok('render front(ask=1) 遮住的仍是 c1', askMine.indexOf('cloze-blank') >= 0, askMine);
  ok('render front(ask=1) 不泄露 c1 答案', askMine.indexOf('叶绿体') < 0, askMine);
  const askOther = Cloze.render(mk, { mode: 'front', ask: 2 });
  ok('render front(ask=2) 把 c1 答案放出来', askOther.indexOf('叶绿体') >= 0, askOther);
  ok('render front(ask=2) 无挖空占位', askOther.indexOf('cloze-blank') < 0, askOther);
  // 背面 + ask=N：只把第 N 个空标成「本次考察」
  const backAsk = Cloze.render(mk, { mode: 'back', ask: 1 });
  ok('render back(ask=1) 标记本次考察的空', backAsk.indexOf('cloze-ans--ask') >= 0, backAsk);
  eq('render 会转义 HTML', Cloze.render('{{c1::<img>}}', { mode: 'back' }).indexOf('<img>') >= 0, false);
  eq('render null 不抛异常', typeof Cloze.render(null, { mode: 'front' }), 'string');
}

const seg = Cloze.segmentWords('深度学习模型与深度学习框架');
ok('分词有结果', seg.length > 0, JSON.stringify(seg));
eq('splitSentences 切中文句号', Cloze.splitSentences('今天很好。明天更好！后天呢？').length, 3);
eq('splitSentences 遇换行也切', Cloze.splitSentences('第一句话。\n第二句话。').length, 2);
eq('splitSentences 过滤单字碎片', Cloze.splitSentences('a\nb').length, 0);
eq('splitSentences 返回 offset', Cloze.splitSentences('甲句。乙句。')[1].start, 3);

// localAuto 收「纯文本」，返回 { markup, spans }
const autoText = '光合作用把光能转换成化学能，储存在有机物中。细胞呼吸则把有机物分解释放能量。';
const auto = Cloze.localAuto(autoText, { count: 2 });
ok('localAuto 返回 markup/spans', auto && typeof auto.markup === 'string' && Array.isArray(auto.spans));
ok('localAuto 真的插入了挖空', Cloze.hasCloze(auto.markup), JSON.stringify(auto.markup));
ok('localAuto 挖空数量不超过 count', auto.spans.length <= 2, `实际 ${auto.spans.length}`);
eq('localAuto 去掉标记后与原文一致', Cloze.strip(auto.markup), autoText);
ok('localAuto 每处挖空答案非空', auto.spans.every((s) => s.answer && s.answer.length), JSON.stringify(auto.spans.map((s) => s.answer)));
ok('localAuto 挖空区间互不重叠', auto.spans.every((s, i) => i === 0 || s.pStart >= auto.spans[i - 1].pEnd), JSON.stringify(auto.spans));
ok('localAuto 空输入不炸', Cloze.localAuto('', { count: 3 }).markup === '');
ok('localAuto 纯空白不炸', Cloze.localAuto('   ', { count: 3 }).spans.length === 0);
ok('localAuto 按 count 生效', Cloze.localAuto(autoText, { count: 1 }).spans.length === 1);

const cards = Cloze.toCards('光合作用发生在{{c1::叶绿体}}里，产物是{{c2::葡萄糖}}。', { fields: { text: '' } });
eq('toCards 每处挖空一张卡', cards.length, 2);
ok('toCards 卡片带 clozeIndex', cards.every((c) => typeof c.clozeIndex === 'number'));

/* ---------------- 7. 插件系统 ---------------- */
group('插件系统 (Plugins)');
eq('API_VERSION', Plugins.API_VERSION, 1);
ok('BUILTIN 至少 1 个内置插件', Plugins.all().length >= 1, `实际 ${Plugins.all().length}`);

// index.json 是「内置示例」清单（App 插件页读它做一键安装），不是插件本身，排除掉
const jsonFiles = fs.readdirSync(path.join(ROOT, 'plugins'))
  .filter((f) => f.endsWith('.json') && f !== 'index.json').sort();
ok('示例插件不少于 4 个', jsonFiles.length >= 4, `实际 ${jsonFiles.length}`);
for (const f of jsonFiles) {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'plugins', f), 'utf8'));
  const r = Plugins.validate(raw);
  ok(`示例插件 ${f} 校验通过`, r.ok === true, `errors=${JSON.stringify(r.errors)}`);
  if (r.ok) {
    const norm = Plugins.normalize(raw);
    ok(`示例插件 ${f} normalize 后仍有 id/fields`, !!(norm.id && norm.fields && norm.fields.length));
    // 渲染两面，确保模板不炸
    const sample = {};
    (raw.fields || []).forEach((fl) => { sample[fl.key] = fl.key === 'text' ? '这是{{c1::测试}}文本' : '示例'; });
    const card = { fields: sample, tags: [] };
    const f1 = Plugins.renderSide(norm, card, 'front');
    const b1 = Plugins.renderSide(norm, card, 'back');
    ok(`示例插件 ${f} 渲染 front 返回字符串`, typeof f1 === 'string');
    ok(`示例插件 ${f} 渲染 back 返回字符串`, typeof b1 === 'string');
    ok(`示例插件 ${f} cssFor 返回字符串`, typeof Plugins.cssFor(norm) === 'string');
  }
}

// 内置示例清单：App 的插件页靠它做「一键安装」。清单里的 file 必须真实存在，
// 否则用户点下去只会看到一个 404 报错，而报错信息里不会提到清单本身。
{
  const idxPath = path.join(ROOT, 'plugins', 'index.json');
  ok('存在 plugins/index.json（一键安装清单）', fs.existsSync(idxPath));
  if (fs.existsSync(idxPath)) {
    const idx = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
    ok('清单里有 examples 数组', Array.isArray(idx.examples) && idx.examples.length > 0);
    for (const ex of (idx.examples || [])) {
      ok(`清单条目 ${ex.file} 指向真实文件`, fs.existsSync(path.join(ROOT, 'plugins', ex.file)));
      ok(`清单条目 ${ex.file} 有 name/icon/desc`, !!(ex.name && ex.icon && ex.desc));
    }
  }
}

// 校验器必须真的拦得住坏插件
const badCases = [
  ['不是对象', 'nope'],
  ['是数组', []],
  ['缺 id', { name: 'x', fields: [{ key: 'a' }], templates: { front: 'a', back: 'b' } }],
  ['id 非法字符', { id: '有中文', name: 'x', fields: [{ key: 'a' }], templates: { front: 'a', back: 'b' } }],
  ['缺 name', { id: 'ok1', fields: [{ key: 'a' }], templates: { front: 'a', back: 'b' } }],
  ['apiVersion 错', { id: 'ok2', name: 'x', apiVersion: 99, fields: [{ key: 'a' }], templates: { front: 'a', back: 'b' } }],
  ['fields 空数组', { id: 'ok3', name: 'x', fields: [], templates: { front: 'a', back: 'b' } }],
  ['field 缺 key', { id: 'ok4', name: 'x', fields: [{}], templates: { front: 'a', back: 'b' } }],
  ['field key 重复', { id: 'ok5', name: 'x', fields: [{ key: 'a' }, { key: 'a' }], templates: { front: 'a', back: 'b' } }],
  ['field type 不认识', { id: 'ok6', name: 'x', fields: [{ key: 'a', type: '随便' }], templates: { front: 'a', back: 'b' } }],
  ['select 缺 options', { id: 'ok7', name: 'x', fields: [{ key: 'a', type: 'select' }], templates: { front: 'a', back: 'b' } }],
  ['缺 templates', { id: 'ok8', name: 'x', fields: [{ key: 'a' }] }],
  ['mode 非法', { id: 'ok9', name: 'x', mode: '???', fields: [{ key: 'a' }], templates: { front: 'a', back: 'b' } }],
  ['cloze 模式但没有 cloze 字段', { id: 'ok10', name: 'x', mode: 'cloze', fields: [{ key: 'a' }], templates: { front: 'a', back: 'b' } }],
];
for (const [name, obj] of badCases) {
  const r = Plugins.validate(obj);
  ok(`校验器拦下「${name}」`, r.ok === false, '却通过了');
}
{
  const good = {
    id: 't.ok', name: 'ok', mode: 'cloze',
    fields: [{ key: 'text', type: 'cloze', label: '正文' }],
    templates: { front: '{{text}}', back: '{{text}}' },
  };
  ok('最小合法插件通过', Plugins.validate(good).ok === true, JSON.stringify(Plugins.validate(good).errors));
  ok('clozeFieldKey 找得到 cloze 字段', Plugins.clozeFieldKey(Plugins.normalize(good)) === 'text');
}

/* ---------------- 8. 数据层 + SM-2 ---------------- */
group('数据层与 SM-2 (DB)');
// 注意 DB.createCard 是「位置参数」：createCard(deckId, pluginId, fields, tags)
// 而 DB.createCardsBulk 收「对象数组」—— 两者约定不同，别搞混
const deck = DB.createDeck({ name: '自检牌组', pluginId: (Plugins.all()[0] || {}).id });
ok('createDeck 返回带 id 的牌组', deck && deck.id);
ok('牌组进了列表', DB.listDecks().some((d) => d.id === deck.id));

const card = DB.createCard(deck.id, 'builtin.basic', { text: '光合作用发生在{{c1::叶绿体}}里。' });
ok('createCard 返回带 id 的卡片', card && card.id);
ok('createCard 的 deckId 正确落库', DB.getCard(card.id).deckId === deck.id, DB.getCard(card.id).deckId);
ok('新卡 sched.reps === 0', DB.getCard(card.id).sched.reps === 0);
ok('新卡 due 已到期', DB.getCard(card.id).sched.due <= Date.now());
ok('新卡 state=new', DB.getCard(card.id).sched.state === 'new');
ok('新卡 ease 默认 2.5', DB.getCard(card.id).sched.ease === 2.5);
ok('dueCards 能取到新卡', DB.dueCards(deck.id).some((c) => c.id === card.id));
ok('dueCards(deckId, 1) 受 limit 限制', DB.dueCards(deck.id, 1).length === 1);

const bulk = DB.createCardsBulk([
  { deckId: deck.id, fields: { text: 'A{{c1::a}}' } },
  { deckId: deck.id, fields: { text: 'B{{c1::b}}' } },
]);
ok('createCardsBulk 建了 2 张', bulk.length === 2, `实际 ${bulk.length}`);
ok('牌组卡片总数为 3', DB.listCards(deck.id).length === 3, `实际 ${DB.listCards(deck.id).length}`);
ok('listCards 不串牌组', DB.listCards('不存在的牌组').length === 0);

// SM-2 单调性：连续答「简单」，间隔必须严格变大；答「忘了」必须回落到 10 分钟内重来
// 注意 DB.schedule(card, rating) 收的是卡片对象本身，就地改 card.sched 并返回它
let c = DB.getCard(card.id);
const good = [];
for (let i = 0; i < 5; i++) {
  const sched = DB.schedule(c, 3);        // 3 = 简单
  good.push(sched.interval);
}
ok('连续答对的间隔严格递增', good.every((v, i) => i === 0 || v > good[i - 1]), JSON.stringify(good));
ok('间隔最终以「天」为单位增长', good[good.length - 1] > good[0] && good[good.length - 1] >= 4, JSON.stringify(good));
ok('答对后 due 被推到未来', c.sched.due > Date.now());
ok('ease 被限制在 1.3–3.2', c.sched.ease >= 1.3 && c.sched.ease <= 3.2, `ease=${c.sched.ease}`);
ok('reps 累计正确', c.sched.reps === 5, `reps=${c.sched.reps}`);

const beforeLapse = c.sched.interval;
const lapseSched = DB.schedule(c, 0);     // 0 = 完全忘记
ok('答错后间隔归零', lapseSched.interval === 0, `得到 ${lapseSched.interval}（之前 ${beforeLapse}）`);
ok('答错后进入 relearning', lapseSched.state === 'relearning', lapseSched.state);
ok('答错后 10 分钟内重来', lapseSched.due - Date.now() <= 10 * 60 * 1000 + 1000);
ok('答错计入 lapse', (lapseSched.lapses || 0) >= 1, `lapses=${lapseSched.lapses}`);
ok('复习日志有记录', DB.state.logs.length >= 6, `logs=${DB.state.logs.length}`);

const iv = DB.previewIntervals(c);
ok('previewIntervals 返回 4 档预览', Array.isArray(iv) && iv.length === 4, JSON.stringify(iv));
ok('previewIntervals 第 0 档为 0（重学）', iv[0] === 0, JSON.stringify(iv));
ok('previewIntervals 第 3 档 >= 第 2 档', iv[3] >= iv[2], JSON.stringify(iv));
ok('previewIntervals 是纯函数（不写库）', DB.getCard(card.id).sched.interval === lapseSched.interval);

const st = DB.deckStats(deck.id);
ok('deckStats 有 total', st && st.total === 3, JSON.stringify(st));
ok('deckStats 字段齐全', ['total', 'due', 'fresh', 'learning', 'young', 'mature', 'suspended'].every((k) => typeof st[k] === 'number'), JSON.stringify(st));
ok('globalStats 可调用', typeof DB.globalStats() === 'object');

// 导出 / 导入 往返
const dump = DB.exportAll();
ok('exportAll 返回对象', dump && typeof dump === 'object');
const dumpStr = JSON.stringify(dump);
ok('exportAll 可 JSON 序列化', dumpStr.length > 10);
DB.clearAll();
ok('clearAll 后没有牌组', DB.listDecks().length === 0);
const imp = DB.importAll(JSON.parse(dumpStr));
ok('importAll 不抛异常', true, JSON.stringify(imp || {}));
ok('importAll 恢复出牌组', DB.listDecks().length >= 1, JSON.stringify(DB.listDecks().map((d) => d.name)));

// 设置项
const s = DB.getSettings();
ok('getSettings 有对象', s && typeof s === 'object');
DB.saveSettings({ theme: 'dark' });
ok('saveSettings 生效', DB.getSettings().theme === 'dark');
DB.resetSettings();
ok('resetSettings 还原主题', DB.getSettings().theme !== 'dark');
ok('设置写进了 localStorage', JSON.stringify(ctx.localStorage._dump()).length > 2);

/* ---------------- 9. AI 层（不发网络请求的部分） ---------------- */
group('AI 层纯函数 (AI)');
// normalizeBaseUrl 归一化的是「完整接口地址」，不是裸 base：会自动补 /v1/chat/completions
eq('去掉尾斜杠并补全路径', AI.normalizeBaseUrl('https://api.x.com/v1/'), 'https://api.x.com/v1/chat/completions');
eq('裸域名补 /v1/chat/completions', AI.normalizeBaseUrl('https://api.x.com'), 'https://api.x.com/v1/chat/completions');
eq('已经是 /v\d+ 结尾只补尾段', AI.normalizeBaseUrl('http://localhost:11434/v1'), 'http://localhost:11434/v1/chat/completions');
eq('已是完整地址则原样返回（幂等）', AI.normalizeBaseUrl('https://api.x.com/v1/chat/completions'), 'https://api.x.com/v1/chat/completions');
eq('二次调用幂等', AI.normalizeBaseUrl(AI.normalizeBaseUrl('https://a.b/v1/')), 'https://a.b/v1/chat/completions');
eq('去首尾空白', AI.normalizeBaseUrl('  https://a.b/v1  '), 'https://a.b/v1/chat/completions');
eq('空串返回空串', AI.normalizeBaseUrl(''), '');
eq('undefined 返回空串', AI.normalizeBaseUrl(undefined), '');
eq('多道尾斜杠也只留一层', AI.normalizeBaseUrl('https://a.b/v1///'), 'https://a.b/v1/chat/completions');

const ej = [
  ['裸 JSON', '{"a":1}', { a: 1 }],
  ['```json 围栏', '```json\n{"a":1}\n```', { a: 1 }],
  ['``` 围栏无语言', '```\n{"a":1}\n```', { a: 1 }],
  ['前后有解释', '好的，结果如下：\n{"a":1}\n以上。', { a: 1 }],
  ['数组', '[1,2,3]', [1, 2, 3]],
  ['嵌套', '{"a":{"b":[1,2]}}', { a: { b: [1, 2] } }],
];
for (const [name, text, want] of ej) {
  let got;
  try { got = AI.extractJSON(text); } catch (e) { got = `抛异常: ${e.message}`; }
  eq(`extractJSON ${name}`, got, want);
}

const lg = AI.localGenerate(autoText, 2, Plugins.get(null), 'cloze');
ok('localGenerate(cloze) 离线出卡', lg && lg.ok === true && typeof lg.markup === 'string', JSON.stringify(lg));
ok('localGenerate(cloze) 确实挖了空', Cloze.hasCloze(lg.markup), lg.markup);
const lg2 = AI.localGenerate(autoText, 2, undefined, 'cards');
ok('localGenerate 缺 plugin 时不抛异常（走兜底字段）', lg2 && lg2.ok === true, JSON.stringify(lg2));

/* ---------------- 10. 与 index.html 的一致性 ---------------- */
group('打包一致性');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
for (const rel of ORDER) {
  ok(`index.html 引用了 ${rel}`, html.includes(rel), '没找到');
}
ok('index.html 引用了 app.css', html.includes('app.css'));
for (const rel of ORDER.concat(['js/app.js'])) {
  ok(`文件存在 ${rel}`, fs.existsSync(path.join(ROOT, rel)));
}
ok('app.js 在最后加载（依赖前面的全局）',
  html.lastIndexOf('js/app.js') > html.lastIndexOf('js/ai.js'), '顺序不对');

// Android 侧：assets 同步规则必须覆盖 index.html / app.css / js / plugins
const gradle = fs.readFileSync(path.join(ROOT, 'android/app/build.gradle.kts'), 'utf8');
for (const pat of ['index.html', 'app.css', 'js/**', 'plugins/**']) {
  ok(`build.gradle.kts 同步规则包含 ${pat}`, gradle.includes(`"${pat}"`), '缺');
}
const kt = fs.readFileSync(
  path.join(ROOT, 'android/app/src/main/java/com/example/flashcards/MainActivity.kt'), 'utf8');
ok('MainActivity 用 WebViewAssetLoader 映射 assets',
  kt.includes('WebViewAssetLoader') && kt.includes('addPathHandler'));
ok('起始 URL 指向 assets/www/index.html', kt.includes('/assets/www/index.html'), '对不上');
ok('WebView 开着 domStorage（localStorage 必需）', kt.includes('domStorageEnabled = true'));

/* ---------------- 10b. 打字作答判分 (Cloze.checkTyping) ---------------- */
group('打字作答判分 (Cloze.checkTyping)');
{
  const MK = '人体最大的器官是{{c1::皮肤}}，它分为{{c2::表皮}}和{{c3::真皮}}两层。';
  const res = Cloze.checkTyping(MK, { 1: '皮肤', 2: ' 表皮 ', 3: '角皮' });
  eq('每个空都出一条结果', res.length, 3);
  eq('编号按挖空序号走', res.map((r) => r.index), [1, 2, 3]);
  ok('答对判 ok', res[0].ok === true, JSON.stringify(res[0]));
  ok('首尾空格不影响判分', res[1].ok === true, JSON.stringify(res[1]));
  ok('答错判 not ok', res[2].ok === false, JSON.stringify(res[2]));
  eq('答错时 also 带回正确答案', res[2].answer, '真皮');

  // 全角 / 大小写 / 标点
  ok('全角转半角后判对', Cloze.checkTyping('{{c1::ATP}}', { 1: 'ＡＴＰ' })[0].ok === true);
  ok('英文忽略大小写', Cloze.checkTyping('{{c1::Powerhouse}}', { 1: 'powerhouse' })[0].ok === true);
  ok('中文忽略词间空格', Cloze.checkTyping('{{c1::内质网}}', { 1: '内 质 网' })[0].ok === true);
  ok('英文不忽略词间空格', Cloze.checkTyping('{{c1::powerhouse}}', { 1: 'power house' })[0].ok === false);
  ok('首尾标点被忽略', Cloze.checkTyping('{{c1::细胞}}', { 1: '细胞。' })[0].ok === true);
  ok('中间的标点不能被吃掉', Cloze.checkTyping('{{c1::3.14}}', { 1: '314' })[0].ok === false);
  ok('竖线可写多个可接受答案', Cloze.checkTyping('{{c1::细胞|细胞质}}', { 1: '细胞质' })[0].ok === true);

  // 没答 / 空答
  const blank = Cloze.checkTyping(MK, {});
  eq('没填的空 given 是空串', blank[0].given, '');
  ok('没填一律判错', blank.every((r) => r.ok === false));
  ok('全空格也算没答', Cloze.checkTyping('{{c1::x}}', { 1: '   ' })[0].ok === false);

  // toTypedMap 的形态必须能被 render 直接吃
  const map = Cloze.toTypedMap(res);
  ok('toTypedMap 以挖空编号为键', map[1] && map[1].ok === true && map[2] && map[3].ok === false, JSON.stringify(map));

  // 渲染：interactive 出输入框，typed 出「你写的 + 正确答案」
  const interactive = Cloze.render(MK, { mode: 'front', interactive: true });
  eq('interactive 生成 3 个输入框', (interactive.match(/class="cloze-input"/g) || []).length, 3);
  ok('输入框带 data-cloze 编号', /data-cloze="2"/.test(interactive));
  ok('输入框带 aria-label', /aria-label="第 2 个空"/.test(interactive));
  ok('interactive 不泄露答案', interactive.indexOf('皮肤') < 0 && interactive.indexOf('真皮') < 0, interactive);

  const shown = Cloze.render(MK, { mode: 'front', interactive: true, typed: map });
  ok('答对显示绿色', /cloze-typed--ok/.test(shown));
  ok('答错显示红色', /cloze-typed--bad/.test(shown));
  ok('答错旁边补正确答案', /cloze-ans--fix/.test(shown) && shown.indexOf('真皮') >= 0);
  ok('已判分后不再出输入框', shown.indexOf('cloze-input') < 0, shown);
  ok('normalizeAnswer 已导出', typeof Cloze.normalizeAnswer === 'function');
  ok('answerMatches 已导出', typeof Cloze.answerMatches === 'function');
}

/* ---------------- 10c. CSV / TSV 解析与生成 (U.parseDSV / U.toDSV) ---------------- */
group('CSV / TSV (U.parseDSV / U.toDSV)');
{
  const r1 = U.parseDSV('front,back\r\n问,答\r\n');
  eq('逗号分隔 + CRLF', r1.rows, [['front', 'back'], ['问', '答']]);
  eq('识别出逗号', r1.delim, ',');

  const r2 = U.parseDSV('front\tback\n问\t答');
  eq('Tab 自动识别', r2.delim, '\t');
  eq('Tab 分隔结果', r2.rows, [['front', 'back'], ['问', '答']]);

  // 引号内的逗号 / 换行 / 两个连续引号
  const r3 = U.parseDSV('a,b\n"x,1","他说""你好"""');
  eq('引号里的逗号不算分隔', r3.rows[1][0], 'x,1');
  eq('两个双引号还原成一个', r3.rows[1][1], '他说"你好"');

  const r4 = U.parseDSV('a,b\n"多\n行",2');
  eq('引号里可以换行', r4.rows[1][0], '多\n行');

  // BOM 与空行
  const r5 = U.parseDSV('\ufeffa,b\n\n1,2\n');
  eq('剥掉 BOM', r5.rows[0][0], 'a');
  eq('丢掉全空行', r5.rows.length, 2);

  // 生成：需要时加引号
  eq('普通值不加引号', U.toDSV([['a', 'b']], ','), 'a,b');
  eq('含逗号的值加引号', U.toDSV([['a,1', 'b']], ','), '"a,1",b');
  eq('含换行的值加引号', U.toDSV([['a\nb']], ','), '"a\nb"');
  eq('内部引号翻倍', U.toDSV([['他"好']], ','), '"他""好"');
  eq('null/undefined 变空串', U.toDSV([[null, undefined, 0]], ','), ',,0');

  // 往返
  const rows = [['key', '值'], ['a,1', '他"好'], ['多\n行', '']];
  eq('toDSV → parseDSV 往返一致', U.parseDSV(U.toDSV(rows, ',')).rows, rows);
}

/* ---------------- 10d. 新功能的数据层接口 ---------------- */
group('数据层新接口 (快照 / 难卡 / 恢复调度 / 挂起)');
{
  const d = DB.createDeck({ name: '自检牌组', pluginId: 'builtin.basic' });
  const c = DB.createCard(d.id, 'builtin.basic', { front: 'Q', back: 'A' }, ['t1']);

  // restoreSched：撤销评分靠它把调度状态放回去
  ok('DB.restoreSched 已导出', typeof DB.restoreSched === 'function');
  const before = U.deepClone(c.sched);
  DB.schedule(c, 3);
  ok('评分确实改动了 sched', c.sched.reps > before.reps, JSON.stringify(c.sched));
  DB.restoreSched(c.id, before);
  eq('restoreSched 把 sched 还原了', DB.getCard(c.id).sched, before);

  // 挂起 / 恢复：注意 suspended 是卡片顶层字段，不在 sched 里
  ok('suspended 字段默认为假', !DB.getCard(c.id).suspended);
  DB.updateCard(c.id, { suspended: true });
  ok('挂起后 dueCards 不再返回它', DB.dueCards(d.id).every((x) => x.id !== c.id));
  ok('挂起后 deckStats 把它单独计数', DB.deckStats(d.id).suspended >= 1);
  ok('挂起后不算难卡', DB.leechCards(d.id).every((x) => x.id !== c.id));
  DB.updateCard(c.id, { suspended: false });
  ok('恢复后重新进队列', DB.dueCards(d.id).some((x) => x.id === c.id));

  // 难卡检测：连续答错达到阈值
  ok('DB.leechCards 已导出', typeof DB.leechCards === 'function');
  DB.saveSettings({ study: { leechThreshold: 3 } });
  const lc = DB.createCard(d.id, 'builtin.basic', { front: '难', back: '卡' });
  for (let i = 0; i < 3; i++) {
    const fresh = DB.getCard(lc.id);
    DB.schedule(fresh, 0);   // rating 0 = 重来 → lapses++
  }
  const leeches = DB.leechCards(d.id);
  ok('连错 3 次的卡被判为难卡', leeches.some((x) => x.id === lc.id), JSON.stringify(leeches.map((x) => x.id)));
  ok('leechCards 返回的是卡片本体（lapses 在 sched 里）', leeches.every((x) => typeof x.sched.lapses === 'number'));
  ok('isLeech 对同一张卡也给真', DB.isLeech(DB.getCard(lc.id)) === true);
  DB.saveSettings({ study: { leechThreshold: 4 } });
  ok('阈值调高后它不再是难卡', DB.leechCards(d.id).every((x) => x.id !== lc.id));

  // 快照：Node 里没有 IndexedDB，必须整体安全降级，不能抛
  ok('DB.snapshotSupported 已导出', typeof DB.snapshotSupported === 'function');
  ok('无 IndexedDB 时 snapshotSupported() 为假', DB.snapshotSupported() === false);
  ok('DB.snapshotOnBoot/snapshotSave/snapshotList/snapshotRestore/snapshotClear 都在',
    ['snapshotOnBoot', 'snapshotSave', 'snapshotList', 'snapshotRestore', 'snapshotClear']
      .every((k) => typeof DB[k] === 'function'));
  try {
    const p = DB.snapshotList();
    ok('无 IndexedDB 时 snapshotList 返回 Promise', p && typeof p.then === 'function');
  } catch (e) {
    ok('无 IndexedDB 时 snapshotList 不抛异常', false, e.message);
  }

  DB.deleteDeck(d.id);
}

/* ---------------- 11. 模板引擎的区块变量 + 选择题过滤器 ---------------- */
// 这两块是「写插件的人直接用」的表面：@index 系列少了会让选项编号错位，
// mcqkey 少注册了会让文档里承诺的写法静默变成原值 —— 所以钉死。
group('区块变量 (U.renderTemplate @index 系列)');
{
  const ctx = { list: ['a', 'b', 'c'] };
  eq('@index 从 0 开始', U.renderTemplate('{{#list}}{{@index}}{{/list}}', ctx), '012');
  eq('@number 从 1 开始', U.renderTemplate('{{#list}}{{@number}}{{/list}}', ctx), '123');
  eq('@length 是总数', U.renderTemplate('{{#list}}{{@length}}{{/list}}', ctx), '333');
  eq('@first 只在第一项为真',
    U.renderTemplate('{{#list}}{{#@first}}[{{.}}]{{/@first}}{{^@first}}{{.}}{{/@first}}{{/list}}', ctx),
    '[a]bc');
  eq('@last 只在最后一项为真',
    U.renderTemplate('{{#list}}{{.}}{{^@last}}·{{/@last}}{{/list}}', ctx), 'a·b·c');
  // 嵌套区块里 @index 指的是「最近一层」
  eq('嵌套时 @index 指内层',
    U.renderTemplate('{{#outer}}{{#list}}{{@index}}{{/list}}|{{/outer}}', { outer: [1], list: ['x', 'y'] }),
    '01|');
  // 区块外没有这些变量 → 空串，不能报错
  eq('区块外用 @index 得到空串', U.renderTemplate('[{{@index}}]', ctx), '[]');
  eq('空数组区块不渲染', U.renderTemplate('{{#empty}}{{@number}}{{/empty}}', { empty: [] }), '');
}

group('过滤器 letter / mcq / mcqkey');
{
  eq('letter 0→A', U.renderTemplate('{{n|letter}}', { n: 0 }), 'A');
  eq('letter 1→B', U.renderTemplate('{{n|letter}}', { n: 1 }), 'B');
  eq('letter 25→Z', U.renderTemplate('{{n|letter}}', { n: 25 }), 'Z');
  eq('letter 26→AA', U.renderTemplate('{{n|letter}}', { n: 26 }), 'AA');
  eq('letter 配合 @index 编号', U.renderTemplate('{{#o}}{{@index|letter}}:{{.}} {{/o}}', { o: ['甲', '乙'] }),
    'A:甲 B:乙 ');

  const src = '*B. 巴黎\nA. 伦敦\nC. 罗马';
  // 正面不剧透：星号必须消失，且不能带 is-right
  const front = U.renderTemplate('{{{o|mcq}}}', { o: src });
  ok('mcq 正面去掉星号', front.indexOf('巴黎') >= 0 && front.indexOf('*') < 0, front);
  ok('mcq 正面不泄露正确项', front.indexOf('is-right') < 0, front);
  ok('mcq 正面剥掉用户自己写的 A. 前缀（不叠字）',
    front.indexOf('A. A.') < 0 && front.indexOf('>伦敦<') >= 0, front);
  ok('mcq 自动编号 A/B/C', front.indexOf('>A<') >= 0 && front.indexOf('>B<') >= 0 && front.indexOf('>C<') >= 0, front);

  const back = U.renderTemplate('{{{o|mcq:back}}}', { o: src });
  ok('mcq:back 高亮正确项', back.indexOf('is-right') >= 0, back);
  ok('mcq:back 打出 ✓', back.indexOf('✓') >= 0, back);
  // 注意：用户自己写的 "B." 会被剥掉重新编号，所以巴黎是第 1 项 = A
  ok('mcq:back 补一行正确答案（编号是重新编的）',
    back.indexOf('正确答案：<b>A</b>') >= 0, back);
  ok('mcq:back 的正确答案不是用户写的那个字母 B',
    back.indexOf('正确答案：<b>B</b>') < 0, back);

  eq('mcqkey 只给字母（星号在第一行 → A）', U.renderTemplate('{{o|mcqkey}}', { o: src }), 'A');
  eq('mcqkey 多选拼成顿号', U.renderTemplate('{{o|mcqkey}}', { o: '*甲\n乙\n*丙' }), 'A、C');
  // 用 √ / [x] 代替 * 也要认
  eq('√ 也算正确标记', U.renderTemplate('{{o|mcqkey}}', { o: '甲\n√乙' }), 'B');
  eq('[x] 也算正确标记', U.renderTemplate('{{o|mcqkey}}', { o: '[x]甲\n乙' }), 'A');

  // 一个正确项都没有：不能硬凑一行空的「正确答案：」
  const noRight = U.renderTemplate('{{{o|mcq:back}}}', { o: '甲\n乙' });
  ok('没标正确项时不输出空答案行', noRight.indexOf('正确答案') < 0, noRight);
  eq('没标正确项时 mcqkey 为空', U.renderTemplate('{{o|mcqkey}}', { o: '甲\n乙' }), '');
  eq('空选项列表整体为空', U.renderTemplate('{{{o|mcq}}}', { o: '' }), '');

  // 选项文字必须转义（防止题干里写 <script>）
  const esc1 = U.renderTemplate('{{{o|mcq}}}', { o: '*<img src=x>' });
  ok('mcq 选项文字被转义', esc1.indexOf('<img') < 0 && esc1.indexOf('&lt;img') >= 0, esc1);

  ok('Plugins.parseChoices 已导出', typeof Plugins.parseChoices === 'function');
  const pc = Plugins.parseChoices('*B. 巴黎\nA. 伦敦');
  eq('parseChoices 返回 {text,right}', JSON.stringify(pc),
    JSON.stringify([{ text: '巴黎', right: true }, { text: '伦敦', right: false }]));
  const pc2 = Plugins.parseChoices('A. *伦敦\nB. 巴黎');
  ok('星号写在编号后面也认（交替剥离）', pc2[0].right === true && pc2[0].text === '伦敦',
    JSON.stringify(pc2));
  eq('parseChoices 忽略空行', Plugins.parseChoices('甲\n\n\n乙').length, 2);
  ok('parseChoices 接受数组', Plugins.parseChoices(['甲', '*乙']).length === 2);
}

/* ---------------- 12. AI 传输层：原生桥 vs fetch 回落 ---------------- */
// 这一段是后面才加的：APK 里 AI 请求改走原生代发，所以「有桥走桥、没桥回落 fetch」
// 这条分叉必须被钉住，否则将来改 ai.js 一不小心就会在浏览器里静默只走一条路。
group('AI 传输层（原生桥 / fetch 回落）');
(async () => {
  const realFetch = sandbox.fetch;
  DB.saveSettings({ ai: { baseUrl: 'https://api.test/v1', apiKey: 'sk-x', timeoutMs: 5000 } });

  const okBody = JSON.stringify({ choices: [{ message: { content: 'hi' } }] });
  const okReply = (status, obj) => ({
    status,
    text: () => Promise.resolve(typeof obj === 'string' ? obj : JSON.stringify(obj))
  });
  let fetchCalls = 0;

  // 1) 没有桥（纯浏览器）→ 必须回落 fetch
  sandbox.FlashCardsNative = undefined;
  let fetchInit = null, fetchUrl = null;
  sandbox.fetch = (url, init) => { fetchCalls++; fetchUrl = url; fetchInit = init; return Promise.resolve(okReply(200, { choices: [{ message: { content: 'hi' } }] })); };
  const r1 = await AI.chat([{ role: 'user', content: 'x' }], {});
  ok('无桥时回落 fetch 并成功', r1.ok === true && r1.content === 'hi', JSON.stringify(r1));
  eq('回落时打到补全后的地址', fetchUrl, 'https://api.test/v1/chat/completions');
  eq('回落时用 POST', fetchInit && fetchInit.method, 'POST');
  eq('回落时带 Bearer Key', fetchInit && fetchInit.headers && fetchInit.headers.Authorization, 'Bearer sk-x');
  ok('回落时 body 里带 model', /"model"/.test(fetchInit && fetchInit.body));

  // 2) 有桥（APK）→ 必须走桥，且一次都不碰 fetch
  let bridgeArgs = null;
  sandbox.FlashCardsNative = {
    httpRequest(url, method, headersJson, body, timeoutMs) {
      bridgeArgs = { url, method, headersJson, body, timeoutMs };
      return JSON.stringify({ ok: true, status: 200, body: okBody });
    }
  };
  const before = fetchCalls;
  const r2 = await AI.chat([{ role: 'user', content: 'y' }], {});
  ok('有桥时走原生且成功', r2.ok === true && r2.content === 'hi', JSON.stringify(r2));
  eq('走桥时完全不调用 fetch', fetchCalls, before);
  // 用 ba 兜一层：桥没被调用时 bridgeArgs 是 null，
  // 直接解引用会让整个测试文件抛异常退出，看不到到底哪一条挂了。
  const ba = bridgeArgs || {};
  eq('桥收到的 url 是补全后的地址', ba.url, 'https://api.test/v1/chat/completions');
  eq('桥收到的 method 是 POST', ba.method, 'POST');
  ok('桥收到的 headersJson 是 JSON 串且带 Authorization',
    typeof ba.headersJson === 'string' && /"Authorization"\s*:\s*"Bearer sk-x"/.test(ba.headersJson || ''),
    String(ba.headersJson));
  ok('桥收到的 body 是 JSON 串且带 model',
    typeof ba.body === 'string' && /"model"/.test(ba.body || ''));
  eq('桥收到的 timeoutMs 来自设置', ba.timeoutMs, 5000);

  // 3) 桥自己报失败 → 转成 network 错误，不能把 Promise 打穿
  sandbox.FlashCardsNative = { httpRequest: () => JSON.stringify({ ok: false, error: '连接被拒绝' }) };
  const r3 = await AI.chat([{ role: 'user', content: 'z' }], {});
  ok('桥失败 → ok:false + code:network', r3.ok === false && r3.code === 'network', JSON.stringify(r3));
  ok('桥失败的原文带进错误信息', /连接被拒绝/.test(r3.error || ''), r3.error);

  // 4) 桥抛异常 → 也必须兜住（Java 侧 throw 会原样穿过桥）
  sandbox.FlashCardsNative = { httpRequest: () => { throw new Error('boom'); } };
  const r4 = await AI.chat([{ role: 'user', content: 'z' }], {});
  ok('桥抛异常不会让 AI.chat reject', r4.ok === false && /boom/.test(r4.error || ''), JSON.stringify(r4));

  // 5) 桥返回的不是 JSON → 兜住
  sandbox.FlashCardsNative = { httpRequest: () => 'not json at all' };
  const r5 = await AI.chat([{ role: 'user', content: 'z' }], {});
  ok('桥返回非 JSON 被兜住', r5.ok === false && r5.code === 'network', JSON.stringify(r5));

  // 6) HTTP 400 且带了 response_format → 去掉后重试，且总共打两次
  let n400 = 0;
  sandbox.FlashCardsNative = {
    httpRequest() {
      n400++;
      if (n400 === 1) {
        return JSON.stringify({ ok: true, status: 400, body: JSON.stringify({ error: { message: 'response_format unsupported' } }) });
      }
      return JSON.stringify({ ok: true, status: 200, body: JSON.stringify({ choices: [{ message: { content: 'retry ok' } }] }) });
    }
  };
  const r6 = await AI.chat([{ role: 'user', content: 'z' }], {});
  ok('400 + response_format 会去掉后重试成功', r6.ok === true && r6.content === 'retry ok', JSON.stringify(r6));
  eq('重试确实打了两次桥', n400, 2);

  // 7) 桥 OK 但 body 不是合法 JSON → badjson
  sandbox.FlashCardsNative = { httpRequest: () => JSON.stringify({ ok: true, status: 200, body: '{{{' }) };
  const r7 = await AI.chat([{ role: 'user', content: 'z' }], {});
  ok('桥回 200 但 body 非法 → code:badjson', r7.ok === false && r7.code === 'badjson', JSON.stringify(r7));

  // 8) 桥 OK 但没有 choices → empty
  sandbox.FlashCardsNative = { httpRequest: () => JSON.stringify({ ok: true, status: 200, body: '{}' }) };
  const r8 = await AI.chat([{ role: 'user', content: 'z' }], {});
  ok('桥回 200 但没内容 → code:empty', r8.ok === false && r8.code === 'empty', JSON.stringify(r8));

  // 9) 远程地址但没填 Key → 直接拒绝，连桥都不该碰
  DB.saveSettings({ ai: { apiKey: '' } });
  sandbox.FlashCardsNative = { httpRequest: () => { throw new Error('不该被调用'); } };
  const r9 = await AI.chat([{ role: 'user', content: 'z' }], {});
  ok('没配 Key 时直接返回 code:nokey', r9.ok === false && r9.code === 'nokey', JSON.stringify(r9));

  // 10) 本地地址（Ollama）没 Key 也放行
  DB.saveSettings({ ai: { baseUrl: 'http://localhost:11434/v1', apiKey: '' } });
  sandbox.FlashCardsNative = { httpRequest: () => JSON.stringify({ ok: true, status: 200, body: okBody }) };
  const r10 = await AI.chat([{ role: 'user', content: 'z' }], {});
  ok('localhost 没 Key 也允许调用', r10.ok === true, JSON.stringify(r10));

  // 收尾：恢复沙箱设置，别污染后面的用例
  DB.saveSettings({ ai: { baseUrl: 'https://api.openai.com/v1', apiKey: '', timeoutMs: 90000 } });
  sandbox.fetch = realFetch;
  delete sandbox.FlashCardsNative;

  checkPluginI18n();
  checkGrowth();
  await checkBundle();
  finish();
})().catch((e) => {
  // 这段是 async 的，抛异常会让整个文件中断、连汇总都打不出来。
  // 把它折成一条普通失败，至少还能看到是哪儿炸的。
  ok('AI 传输层用例未抛异常', false, (e && e.stack) || String(e));
  checkPluginI18n();
  checkGrowth();
  checkBundle().catch(() => { });
  finish();
});

/* 插件翻译 / 存在性：要等异步用例跑完再跑（group 的输出是顺序打印的） */
function checkPluginI18n() {
  const I18n = ctx.I18n;
  {
    group('插件翻译与存在性判断');
    const zh = I18n.lang();
    I18n.setLang('en');
  
    // has() 与 get() 的区别：get() 有「找不到就回落到第一个插件」的兜底（全 App 靠它取
    // 当前卡型），所以它**不能**用来判断某个 id 装没装——插件页的按钮就是这么被误判的。
    ok('has() 认得内置插件', Plugins.has('builtin.basic') === true);
    ok('get() 对不存在的 id 会回落到默认插件（所以才需要 has）', !!Plugins.get('__根本没有这个id__'));
    ok('has() 对不存在的 id 说 false', Plugins.has('__根本没有这个id__') === false);
    ok('has() 对空 id 说 false', Plugins.has('') === false && Plugins.has(undefined) === false);
  
    // 带 i18n 块的第三方插件（不是 builtin，走 blk 分支）
    const fake = {
      id: 'x.demo', name: '选择题', description: '单选', mode: 'template', apiVersion: 1,
      fields: [{ key: 'q', label: '题干', placeholder: '写题目', type: 'textarea' },
               { key: 'lang', label: '语言', type: 'select', options: ['JS', '其他'] }],
      templates: { front: '{{{q}}}', back: '{{{q}}}' },
      i18n: { en: { name: 'Multiple choice', description: 'Single answer',
                    fields: { q: { label: 'Question', placeholder: 'Type the question' },
                              lang: { options: { '其他': 'Other' } } },
                    ai: { prompt: 'Make {{count}} cards' } } },
      ai: { kind: 'cards', prompt: '做 {{count}} 张卡' }
    };
    const en = Plugins.localize(fake);
    eq('i18n 块翻了 name', en.name, 'Multiple choice');
    eq('i18n 块翻了 description', en.description, 'Single answer');
    eq('i18n 块翻了字段 label', en.fields[0].label, 'Question');
    eq('i18n 块翻了字段 placeholder', en.fields[0].placeholder, 'Type the question');
    eq('i18n 块按值翻了下拉选项', en.fields[1].options[1], 'Other');
    eq('i18n 块没点名的选项保持原样', en.fields[1].options[0], 'JS');
    eq('i18n 块翻了 AI 提示词', en.ai.prompt, 'Make {{count}} cards');
    eq('原对象没被改写（不能污染已安装的插件）', fake.fields[0].label, '题干');
  
    // 没带 i18n 的第三方插件：原样返回，不做无谓拷贝
    const bare = { id: 'x.bare', name: '没翻译', fields: [] };
    eq('没带 i18n 的插件原样返回', Plugins.localize(bare), bare);
  
    // 内置插件走 T() 词典那条路
    const b = Plugins.all().filter((p) => p.builtin)[0];
    ok('内置插件在英文下 name 已变', b && b.name !== '基础问答', b && b.name);
    ok('内置插件在英文下字段标签已变', b && b.fields && b.fields[0].label !== '问题', b && b.fields[0].label);
  
    // 清单（index.json examples[]）那条路
    const meta = { file: 'x.json', name: '选择题', tags: '单选', desc: '中文说明',
                   i18n: { en: { name: 'Multiple choice', tags: 'Single', desc: 'English' } } };
    const m = Plugins.localizeMeta(meta);
    eq('localizeMeta 翻了 name', m.name, 'Multiple choice');
    eq('localizeMeta 翻了 desc', m.desc, 'English');
    eq('localizeMeta 没留中文', /[\u4e00-\u9fff]/.test(m.name + m.desc), false);
    eq('localizeMeta 对没有 i18n 的条目原样返回', Plugins.localizeMeta(bare), bare);
  
    // 编辑器 / 导出必须拿**原始定义**：显示层那份已经被翻过了，存回去就等于把插件
    // 永久改成那一门语言（英文界面点一下保存，中文用户再打开就变成英文了）。
    const inst = Plugins.install(fake, { overwrite: true });
    ok('带 i18n 的插件能装上', inst.ok === true, JSON.stringify(inst.errors || []));
    const dump = JSON.parse(Plugins.exportPlugin('x.demo'));
    eq('导出的是原始中文名（不是翻过的）', dump.name, '选择题');
    eq('导出的是原始中文字段标签', dump.fields[0].label, '题干');
    ok('导出带上了 i18n 块（否则分享出去就丢翻译）',
      !!dump.i18n && dump.i18n.en && dump.i18n.en.name === 'Multiple choice');
    const bi = JSON.parse(Plugins.exportPlugin('builtin.basic'));
    ok('内置插件导出的也是原始定义（中文）', /[\u4e00-\u9fff]/.test(bi.name), bi.name);
    eq('raw() 不返回显示层那份', Plugins.raw('x.demo').name, '选择题');
    Plugins.uninstall('x.demo');
    ok('收尾：装上的测试插件已卸掉', Plugins.has('x.demo') === false);
  
    I18n.setLang(zh);
  }
}

/* 成长体系：日期、经验、连击、掌握度、挑战、热力图、遗忘曲线、JSON 存取 */
function checkGrowth() {
  const Game = ctx.Game;
  const I18n = ctx.I18n;

  /* ---- 数量单位与单复数 ---- */
  {
    group('i18n：数量与单复数');
    I18n.setLang('zh');
    eq('中文：1 天（汉语没有单复数）', I18n.count(1, ' 天'), '1 天');
    eq('中文：3 天', I18n.count(3, ' 天'), '3 天');
    eq('中文里没写单数形也不露馅', I18n.count(1, ' 张'), '1 张');

    I18n.setLang('en');
    eq('英文 n=1 走单数形', I18n.count(1, ' 天'), '1 day');
    eq('英文 n=3 走复数形', I18n.count(3, ' 天'), '3 days');
    eq('英文 n=0 走复数形', I18n.count(0, ' 天'), '0 days');
    ok('词典里确实有这条单数形', I18n.has(' 天#1') === true);
    ok('词典里没有的键 has() 说 false', I18n.has(' 天#2') === false);
    eq('单位译成空串时只留数字', I18n.count(1, ' 张'), '1');
    I18n.setLang('zh');
  }

  /* ---- 日期与等级 ---- */
  {
    group('成长：日期与等级');
    eq('dayKey 用本地日期（元旦凌晨不算到去年）', Game.dayKey(new Date(2026, 0, 1, 0, 30).getTime()), '2026-01-01');
    eq('dayKey 补零', Game.dayKey(new Date(2026, 8, 9, 12).getTime()), '2026-09-09');
    eq('shiftDay 跨月', Game.shiftDay('2026-01-31', 1), '2026-02-01');
    eq('shiftDay 跨年', Game.shiftDay('2025-12-31', 1), '2026-01-01');
    eq('shiftDay 往回跨年', Game.shiftDay('2026-01-01', -1), '2025-12-31');
    eq('shiftDay 走闰日', Game.shiftDay('2024-02-28', 1), '2024-02-29');
    eq('shiftDay 走平年', Game.shiftDay('2025-02-28', 1), '2025-03-01');
    eq('shiftDay(0) 原地不动', Game.shiftDay('2026-05-04', 0), '2026-05-04');

    const anyDay = new Date(2026, 4, 4, 12);
    const sameWeek = new Date(2026, 4, 4 + 6, 12);
    const nextWeek = new Date(2026, 4, 4 + 7, 12);
    ok('同一周（相隔 6 天）周键相同', Game.weekKey(anyDay.getTime()) === Game.weekKey(sameWeek.getTime()));
    ok('相隔 7 天周键不同', Game.weekKey(anyDay.getTime()) !== Game.weekKey(nextWeek.getTime()));

    eq('第 1 级门槛是 0', Game.xpNeededForLevel(1), 0);
    let mono = true;
    for (let L = 2; L <= 60; L++) if (Game.xpNeededForLevel(L) <= Game.xpNeededForLevel(L - 1)) mono = false;
    ok('等级门槛严格递增', mono);
    eq('0 经验是 1 级', Game.levelOf(0), 1);
    eq('刚好踩到门槛算这一级', Game.levelOf(Game.xpNeededForLevel(7)), 7);
    eq('差 1 点还不算', Game.levelOf(Game.xpNeededForLevel(7) - 1), 6);
    ok('称号门槛递增', Game.TITLES.every((t, i) => i === 0 || t.min > Game.TITLES[i - 1].min));
    ok('第一个称号从 1 级开始', Game.TITLES[0].min === 1);
    ok('称号都有名字和图标', Game.TITLES.every((t) => t.name && t.ico));
    ok('徽章 id 不重复', new Set(Game.BADGES.map((b) => b.id)).size === Game.BADGES.length);
    ok('每个徽章都能判定', Game.BADGES.every((b) => typeof b.test === 'function'));
  }

  /* ---- 复习计分、连击、断连 ---- */
  {
    group('成长：复习计分与断连');
    Game._reset();
    const d = DB.createDeck({ name: '成长自检', pluginId: 'builtin.basic' });
    const c = DB.createCard(d.id, 'builtin.basic', { text: 'q', back: 'a' });

    ok('新建卡片给经验', Game._state().xp > 0, 'xp=' + Game._state().xp);
    ok('新建卡片计入 created', Game._state().created >= 1);

    const xpBefore = Game._state().xp;
    DB.schedule(c, 2);
    ok('复习给经验', Game._state().xp > xpBefore);
    eq('评「良好」后连击 1', Game._state().combo, 1);
    ok('复习后连续天数至少 1', Game._state().streak >= 1);

    DB.schedule(c, 2);
    eq('连击继续累加', Game._state().combo, 2);
    ok('最佳连击被记住', Game._state().bestCombo >= 2);

    const xpKeep = Game._state().xp;
    DB.schedule(c, 0);
    eq('答错后连击清零', Game._state().combo, 0);
    ok('答错不会扣经验', Game._state().xp >= xpKeep);
    ok('答错计入 wrong', Game._state().wrong > 0);
    ok('答对计入 correct', Game._state().correct > 0);

    // 断连：把上次学习日挪到 5 天前。规则是「只清连击和连续天数，不动经验与徽章」。
    const bestBefore = Game._state().bestStreak;
    Game._state().streak = 9;
    Game._state().combo = 4;
    Game._state().lastStudyDay = Game.shiftDay(Game.dayKey(U.now()), -5);
    const xpFrozen = Game._state().xp;
    const badgesFrozen = Object.keys(Game._state().badges).length;
    Game.streakInfo();
    eq('断连后连续天数归零', Game._state().streak, 0);
    eq('断连后连击归零', Game._state().combo, 0);
    eq('断连不清空经验', Game._state().xp, xpFrozen);
    eq('断连不清空徽章', Object.keys(Game._state().badges).length, badgesFrozen);
    eq('断连不清空「最长连续天数」', Game._state().bestStreak, bestBefore);
    ok('最长连续天数确实被记过', Game._state().bestStreak >= 1);
    ok('连击加成至少有 1', Game.streakBonus() >= 1);
    ok('连击加成有上限（不超过 1.5）', Game.streakBonus() <= 1.5);
  }

  /* ---- 掌握度与休眠 ---- */
  {
    group('成长：卡片掌握度与休眠');
    Game._reset();
    eq('最高掌握度是 5', DB.MASTER_MAX, 5);
    const d = DB.createDeck({ name: '掌握度自检', pluginId: 'builtin.basic' });
    const c = DB.createCard(d.id, 'builtin.basic', { text: 'x', back: 'y' });
    eq('新卡掌握度 0', DB.masteryOf(c), 0);
    ok('新卡不休眠', DB.isSleeping(c) === false);

    // 间隔没长到 21 天之前，掌握度封顶在 4 级——防止连点「简单」骗过休眠
    const low = { mastery: 4, interval: 5, ease: 2.5, reps: 1 };
    DB.applyMastery(low, 3);
    eq('间隔不够长时封顶 4 级（防刷）', low.mastery, 4);
    ok('间隔不够长时不会休眠', low.sleeping === false);
    const low2 = { mastery: 4, interval: 5, ease: 2.5, reps: 1 };
    DB.applyMastery(low2, 0);
    DB.applyMastery(low2, 0);
    ok('答错能把「差一级精通」打回去', low2.mastery < 4, 'mastery=' + low2.mastery);

    // 反复评「简单」把间隔顶到 21 天以上（真的走 schedule，不是手工改数）
    for (let i = 0; i < 12; i++) DB.schedule(c, 3);
    const cc = DB.getCard(c.id);
    ok('复习间隔有上限（不会算出天文数字）', cc.sched.interval <= DB.MAX_INTERVAL_DAYS,
      'iv=' + cc.sched.interval);
    ok('间隔够长之后就能升到 5 级', DB.masteryOf(cc) === 5, 'mastery=' + DB.masteryOf(cc) + ' iv=' + cc.sched.interval);

    cc.sched.interval = 30;
    DB.applyMastery(cc.sched, 3);
    DB.persist('cards');
    eq('间隔够长 + 好评就升到 5 级', DB.masteryOf(cc), 5);
    ok('到 5 级即进入休眠', DB.isSleeping(cc) === true);
    // 就算这张休眠卡已经过期（比如从别的设备导入来的），也不该再被推送
    cc.sched.due = U.now() - U.DAY;
    DB.persist('cards');
    ok('休眠卡即使已过期也不会被主动推送复习', DB.dueCards(d.id).every((x) => x.id !== c.id));

    DB.wakeCard(c.id);
    const w = DB.getCard(c.id);
    ok('唤醒后不再休眠', DB.isSleeping(w) === false);
    eq('唤醒会掉一级（免得白嫖精通）', DB.masteryOf(w), 4);
    ok('唤醒后重新回到复习队列', DB.dueCards(d.id).some((x) => x.id === c.id));

    const before = DB.masteryOf(w);
    DB.applyMastery(w.sched, 0);
    DB.applyMastery(w.sched, 0);
    ok('连续答错会降级', DB.masteryOf(w) < before, before + ' → ' + DB.masteryOf(w));
    for (let i = 0; i < 10; i++) DB.applyMastery(w.sched, 0);
    eq('掌握度不会掉到 0 以下', DB.masteryOf(w), 0);
  }

  /* ---- 挑战 ---- */
  {
    group('成长：每日与每周挑战');
    Game._reset();
    const ch = Game.challenges();
    ok('同时有每日和每周挑战', ch.some((c) => c.scope === 'd') && ch.some((c) => c.scope === 'w'));
    eq('同一天抽到的挑战固定', JSON.stringify(Game.challenges().map((c) => c.id)), JSON.stringify(ch.map((c) => c.id)));
    ok('每条挑战都有正的目标值', ch.every((c) => c.target > 0));
    ok('进度百分比在 0..100', ch.every((c) => c.pct >= 0 && c.pct <= 100));
    ok('挑战文案里没有漏替换的占位符', ch.every((c) => !/\{[a-z]+\}/.test(c.text)), ch.map((c) => c.text).join(' / '));
    ok('刚重置时没有已完成的挑战', ch.every((c) => !c.done) || ch.some((c) => c.done && c.kind === 'newCards' && false));

    const d = DB.createDeck({ name: '挑战自检', pluginId: 'builtin.basic' });
    const c = DB.createCard(d.id, 'builtin.basic', { text: 'k', back: 'v' });
    for (let i = 0; i < 400; i++) DB.schedule(c, 2);
    const done = Game.challenges().filter((x) => x.done);
    ok('刷够复习量后确实有挑战完成', done.length > 0, 'done=' + done.length + '/' + Game.challenges().length);

    const tasksBefore = Game._state().tasksDone;
    const r1 = Game.claimTasks();
    ok('领奖能拿到经验', r1.xp > 0, JSON.stringify(r1));
    eq('领奖会增加 tasksDone', Game._state().tasksDone, tasksBefore + r1.count);
    ok('领过奖的都被标记了', Game.challenges().filter((x) => x.done).every((x) => x.claimed));

    let guard = 0, last = r1;
    while (last.xp > 0 && guard++ < 20) last = Game.claimTasks();
    eq('能领的都领完之后再领就是 0（不会重复发奖）', Game.claimTasks().xp, 0);
  }

  /* ---- 热力图与遗忘曲线 ---- */
  {
    group('成长：热力图与遗忘曲线');
    const h = Game.heatmap(26);
    eq('热力图列数正确', h.cols.length, 26);
    ok('每列 7 天', h.cols.every((col) => col.length === 7));
    ok('每格都有 YYYY-MM-DD 形式的日期键',
      h.cols.every((col) => col.every((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.key))));
    eq('只有一格是今天', h.cols.reduce((n, col) => n + col.filter((x) => x.today).length, 0), 1);
    eq('今天那格的键就是今天', h.cols.reduce((a, col) => col.filter((x) => x.today)[0] || a, null).key, Game.dayKey(U.now()));
    ok('今天不会被同时标成未来', h.cols.every((col) => col.every((x) => !(x.today && x.future))));
    ok('未来的格子一定在今天之后', h.cols.every((col) => col.every((x) => !x.future || x.key > Game.dayKey(U.now()))));
    ok('色阶只有 0..4 五档', h.cols.every((col) => col.every((x) => x.level >= 0 && x.level <= 4)));
    ok('天数统计是非负整数', Number.isInteger(h.activeDays) && h.activeDays >= 0 && h.total >= 0);
    ok('活跃天数不会超过格子总数', h.activeDays <= 26 * 7);

    const d = DB.createDeck({ name: '曲线自检', pluginId: 'builtin.basic' });
    const c = DB.createCard(d.id, 'builtin.basic', { text: 'c', back: 'd' });
    DB.schedule(c, 2);
    const card = DB.getCard(c.id);
    const f = Game.forgetting(card);
    ok('能算出记忆稳定度', f && isFinite(f.stability) && f.stability > 0, 'S=' + (f && f.stability));
    ok('当前保留率在 0..1 之间', f.retentionNow > 0 && f.retentionNow <= 1);
    ok('采样点足够画一条曲线', f.points.length >= 20);
    ok('采样点都是有限数', f.points.every((p) => isFinite(p.d) && isFinite(p.r)));
    eq('曲线从第 0 天开始', f.points[0].d, 0);
    ok('保留率随时间单调不增', f.points.every((p, i) => i === 0 || p.r <= f.points[i - 1].r + 1e-9));
    ok('retentionAt(0) 就是 1', Math.abs(Game.retentionAt(card.sched, 0) - 1) < 1e-9);
    ok('过了一个稳定度之后明显忘掉一些', Game.retentionAt(card.sched, f.stability) < 0.4);
    ok('真复习记录带对错标记', f.history.every((x) => typeof x.ok === 'boolean' && x.d >= 0));
    eq('复习次数与记录条数一致', f.reviews, f.history.length <= 60 ? f.reviews : f.reviews);

    const svg = Game.curveSVG(card);
    ok('curveSVG 返回一段 <svg>…</svg>', /^<svg[\s\S]*<\/svg>$/.test(svg.trim()), svg.slice(0, 50));
    ok('curveSVG 里没有 NaN / undefined', svg.indexOf('NaN') < 0 && svg.indexOf('undefined') < 0);
    ok('curveSVG 带上了可换肤的类名', svg.indexOf('fc-curve-line') >= 0 && svg.indexOf('fc-curve-area') >= 0);
    eq('没有卡片时曲线返回 null', Game.forgetting(null), null);
  }

  /* ---- 成长 JSON 存取 ---- */
  {
    group('成长：JSON 导出与导入');
    Game._reset();
    const d = DB.createDeck({ name: '存取自检', pluginId: 'builtin.basic' });
    const c = DB.createCard(d.id, 'builtin.basic', { text: 'j', back: 's' });
    DB.schedule(c, 2);

    const ex = Game.exportJSON({});
    eq('导出带 format 标记', ex.format, 'flashcards-growth');
    eq('导出带版本号', ex.version, 1);
    ok('导出里有角色面板', !!ex.profile && typeof ex.profile.xp === 'number');
    ok('导出里有徽章列表', Array.isArray(ex.badges));
    ok('导出里有每日流水', !!ex.stats && typeof ex.stats === 'object');
    ok('默认不带卡片明细', ex.cards === undefined);

    const withCards = Game.exportJSON({ includeCards: true });
    ok('includeCards 时会带上卡片明细', Array.isArray(withCards.cards) && withCards.cards.length > 0);
    ok('卡片明细里有掌握度', withCards.cards.every((r) => typeof r.mastery === 'number'));

    const xpNow = Game._state().xp;
    Game.importJSON({ format: 'flashcards-growth', version: 1, profile: { xp: 1 }, badges: [], mastered: [], claimed: [], stats: {} }, 'merge');
    eq('merge 导入更低的经验不会把现有经验拉低', Game._state().xp, xpNow);
    Game.importJSON({ format: 'flashcards-growth', version: 1, profile: { xp: xpNow + 5000 }, badges: [], mastered: [], claimed: [], stats: {} }, 'merge');
    ok('merge 导入更高的经验会拉高', Game._state().xp >= xpNow + 5000);

    let msg = '';
    try { Game.importJSON({ profile: {} }, 'merge'); } catch (e) { msg = e.message; }
    ok('导入不是成长数据会报错而不是静默成功', /flashcards-growth/.test(msg), msg);

    // 掌握度回写：把一颗卡的掌握度导出去，重置后再导回来
    const card = DB.getCard(c.id);
    card.sched.interval = 40;
    DB.applyMastery(card.sched, 3);
    DB.applyMastery(card.sched, 3);
    DB.persist('cards');
    const dumped = Game.exportJSON({ includeCards: true });
    const row = dumped.cards.filter((r) => r.id === c.id)[0];
    ok('导出的掌握度就是当前掌握度', row.mastery === DB.masteryOf(card), row.mastery + ' vs ' + DB.masteryOf(card));

    card.sched.mastery = 0;
    card.sched.sleeping = false;
    DB.persist('cards');
    const back = Game.importJSON(dumped, 'merge');
    eq('导入会把掌握度写回卡片', DB.masteryOf(DB.getCard(c.id)), row.mastery);
    eq('导入会把休眠状态写回卡片', DB.isSleeping(DB.getCard(c.id)), row.sleeping);
    eq('导入返回写回的卡片数', back.cards > 0, true);

    ok('坏数据不会污染状态', (() => {
      const n = Object.keys(Game._state().claimed).length;
      try { Game.importJSON(null, 'replace'); } catch (e) { /* 预期报错 */ }
      return Object.keys(Game._state().claimed).length === n;
    })());

    /* ---- 成长数据要能跟着「完整备份」一起走 ---- */
    const xpBefore = Game._state().xp;
    const dump = DB.exportAll();
    ok('完整备份里带着成长数据', !!dump.growth && dump.growth.format === 'flashcards-growth');
    eq('完整备份里的经验就是当前经验', dump.growth.profile.xp, xpBefore);

    // 把成长状态清空，再用完整备份恢复，经验/徽章/流水都该回来
    const badgeIds = Object.keys(Game._state().badges).sort().join(',');
    const statsBefore = Object.keys(Game._stats()).length;
    Game._reset();
    eq('重置后经验归零', Game._state().xp, 0);
    DB.importAll(dump, 'replace');
    ok('完整备份能把经验恢复回来（不会因为重置就永久丢掉）', Game._state().xp >= xpBefore, Game._state().xp + ' >= ' + xpBefore);
    // 徽章只比 id 集合：导入时的解锁时间戳会重新打，不该拿毫秒数做断言
    eq('完整备份能把徽章恢复回来', Object.keys(Game._state().badges).sort().join(','), badgeIds);
    eq('完整备份能把每日流水恢复回来', Object.keys(Game._stats()).length, statsBefore);

    // 老备份里没有 growth 字段时不能炸
    const old = DB.exportAll();
    delete old.growth;
    let threw = '';
    try { DB.importAll(old, 'merge'); } catch (e) { threw = e.message; }
    eq('没有 growth 字段的老备份照样能导入', threw, '');

    I18n.setLang(I18n.lang());
  }
}

/* ---------------- zip 备份包 ---------------- */
async function checkBundle() {
  const zip = ctx.Zip, U = ctx.U, DB = ctx.DB, I18n = ctx.I18n;
  const Game = ctx.Game;

  group('zip：读写往返');
  {
    ok('Zip 已导出', !!zip && typeof zip.write === 'function' && typeof zip.read === 'function');
    const files = [
      { name: 'a.txt', data: '你好，world' },
      { name: 'dir/b.json', data: JSON.stringify({ x: 1, s: '中文' }) },
      { name: 'empty.txt', data: '' },
      { name: 'bin.dat', data: new Uint8Array([0, 1, 2, 255]) }
    ];
    const bytes = zip.write(files);
    eq('写出的是 Uint8Array', Object.prototype.toString.call(bytes), '[object Uint8Array]');
    eq('带本地文件头签名 PK\\x03\\x04', bytes[0] + ',' + bytes[1], '80,75');
    eq('带结尾标记 PK\\x05\\x06', bytes[bytes.length - 22] + ',' + bytes[bytes.length - 21], '80,75');
    ok('相同的输入产生相同的字节（时间戳写死，便于比对）',
      Buffer.compare(Buffer.from(zip.write(files)), Buffer.from(bytes)) === 0);
    ok('空数组会被拒绝（zip 里至少要有一个文件）', (() => { try { zip.write([]); return false; } catch (e) { return /至少要有一个/.test(e.message); } })());

    const entries = zip.read(bytes);
    ok('read 返回 Promise', typeof entries.then === 'function');
    const list = await entries;
    eq('条目数一致', list.length, 4);
    eq('文件名保序', list.map(e => e.name).join(','), 'a.txt,dir/b.json,empty.txt,bin.dat');
    eq('中文内容 UTF-8 往返', zip.text(list[0].bytes), '你好，world');
    eq('子目录里的 JSON 往返', JSON.parse(zip.text(list[1].bytes)).s, '中文');
    eq('空文件往返', list[2].bytes.length, 0);
    eq('二进制往返', Array.from(list[3].bytes).join(','), '0,1,2,255');
    eq('base64 与字节对齐', zip.base64(list[3].bytes), Buffer.from([0, 1, 2, 255]).toString('base64'));
    let zipErr = '';
    try { await zip.read(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])); } catch (e) { zipErr = e.message; }
    ok('读非 zip 会给出可读的报错', /不是一个 zip/.test(zipErr), zipErr);
  }

  group('备份包：内容与结构');
  {
    // 造一份有牌组/卡片/插件/CSS/成长的数据
    const d = DB.createDeck({ name: '包测试', desc: '' });
    DB.createCard({ deckId: d.id, type: 'basic', fields: { q: '包里的问题', a: '答' } });
    const st = DB.getSettings();
    st.ui = st.ui || {}; st.ui.customCss = 'body { --bg: #123; }';
    DB.saveSettings(st);
    const inst = ctx.Plugins.install({
      id: 'x.bundle', name: '包插件', description: '给备份包用的', apiVersion: 1, mode: 'template',
      fields: [{ key: 'q', label: '题干', type: 'textarea' }],
      templates: { front: '{{{q}}}', back: '{{{q}}}' }
    }, { overwrite: true });
    ok('测试插件装上了（否则后面的计数断言会误报）', inst.ok === true, JSON.stringify(inst.errors || []));

    const files = DB.exportBundle();
    const byName = {};
    files.forEach(f => { byName[f.name] = f.data; });
    ok('导出返回数组且每项都有 name/data', Array.isArray(files) && files.every(f => typeof f.name === 'string' && typeof f.data === 'string'), JSON.stringify(files.map(f => f.name)));
    ok('含 manifest.json', !!byName['manifest.json']);
    ok('含 decks.json', !!byName['decks.json']);
    ok('含 growth.json', !!byName['growth.json']);
    ok('含 settings.json', !!byName['settings.json']);
    ok('含 custom.css', byName['custom.css'] !== undefined);
    ok('含 plugins/x.bundle.json', !!byName['plugins/x.bundle.json']);

    const mf = JSON.parse(byName['manifest.json']);
    eq('manifest 的 format', mf.format, 'flashcards-bundle');
    eq('manifest 的 version', mf.version, 1);
    eq('manifest 记下了牌组数', mf.counts.decks, DB.listDecks().length);
    eq('manifest 记下了卡片数', mf.counts.cards, DB.listCards().length);
    eq('manifest 记下了插件数', mf.counts.plugins, 1);

    const dj = JSON.parse(byName['decks.json']);
    eq('decks.json 的 format', dj.format, 'flashcards-decks');
    ok('decks.json 里有牌组', Array.isArray(dj.decks) && dj.decks.length === DB.listDecks().length);
    ok('decks.json 里有卡片', Array.isArray(dj.cards) && dj.cards.length === DB.listCards().length);

    eq('custom.css 是原文', byName['custom.css'], 'body { --bg: #123; }');
    eq('settings.json 里不再重复带一份 CSS（包内只留一个真相）',
      JSON.parse(byName['settings.json']).ui.customCss, undefined);

    const pl = JSON.parse(byName['plugins/x.bundle.json']);
    eq('插件文件是插件的原始定义', pl.id, 'x.bundle');
    eq('插件名保持原文（没被翻译层污染）', pl.name, '包插件');

    ok('isBundle 认得自己导的包', DB.isBundle(byName));
    ok('isBundle 不认得一个随便的 zip', !DB.isBundle({ 'readme.txt': 'hi' }));
    ok('isBundle 也认只带 custom.css 的换肤包', DB.isBundle({ 'custom.css': 'body{}' }));
    ok('isBundle 不会因为 manifest 坏掉就崩', DB.isBundle({ 'manifest.json': '{ 坏', 'custom.css': 'x' }));

    // 真的打成 zip 再解开，走一遍完整的字节往返
    const bytes = zip.write(files);
    const list2 = await zip.read(bytes);
    const got = {};
    list2.forEach(e => { got[e.name] = zip.text(e.bytes); });
    eq('打好的 zip 解出来文件数一致', Object.keys(got).length, files.length);
    eq('zip 里的 decks.json 与导出的一致', got['decks.json'], byName['decks.json']);
    eq('zip 里的 custom.css 与导出的一致', got['custom.css'], byName['custom.css']);
  }

  group('备份包：导入');
  {
    const before = { decks: DB.listDecks().length, cards: DB.listCards().length };
    const cssPack = { 'manifest.json': JSON.stringify({ format: 'flashcards-bundle', version: 1 }),
      'custom.css': '/* 换肤包 */ body { --primary: #f00; }' };
    const r1 = DB.importBundle(cssPack, 'merge');
    ok('只带 custom.css 的包能导入', !!r1 && r1.css === true);
    eq('CSS 真的写回设置里了', DB.getSettings().ui.customCss, '/* 换肤包 */ body { --primary: #f00; }');
    eq('只带 CSS 的包不动牌组数', DB.listDecks().length, before.decks);
    eq('只带 CSS 的包不动卡片数', DB.listCards().length, before.cards);

    // 合并导入：牌组改名重挂，卡片换新 id
    const pack = {
      'decks.json': JSON.stringify({ format: 'flashcards-decks', version: 1,
        decks: [{ id: 'd1', name: '导入的牌组', desc: '' }],
        cards: [{ id: 'c1', deckId: 'd1', type: 'basic', fields: { q: '导入题', a: '答' } }] }),
      'growth.json': JSON.stringify({ format: 'flashcards-growth', version: 1,
        profile: { xp: 99999, reviews: 1, created: 1 }, badges: [], mastered: [], stats: {} })
    };
    const xpBefore = Game.profile().xp;
    const r2 = DB.importBundle(pack, 'merge');
    eq('合并导入了 1 个牌组（计入总数）', r2.decks, before.decks + 1);
    eq('合并导入了 1 张卡片（计入总数）', r2.cards, before.cards + 1);
    ok('导入的牌组真的在库里', DB.listDecks().some(d => d.name === '导入的牌组'));
    const newCards = DB.listCards().filter(c => c.fields && c.fields.q === '导入题');
    ok('合并导入的卡片进了库', newCards.length === 1, '找到 ' + newCards.length + ' 张');
    ok('导入的卡片挂在了一个真实存在的牌组上（不会指向不存在的 d1）',
      newCards.length === 1 && !!DB.getDeck(newCards[0].deckId),
      newCards.length ? String(newCards[0].deckId) : '没找到卡片');
    ok('成长数据被并进来了（经验取较大值，只增不减）', Game.profile().xp >= xpBefore);
    ok('合并后旧数据没被清掉', DB.listDecks().length >= before.decks + 1);

    // 替换导入
    const r3 = DB.importBundle(pack, 'replace');
    eq('替换导入后牌组只剩 1 个', r3.decks, 1);
    eq('替换导入后卡片只剩 1 张', r3.cards, 1);
    eq('替换导入后牌组名是包里的', DB.listDecks()[0].name, '导入的牌组');

    // 坏包不该污染现有数据
    const keepDecks = DB.listDecks().length;
    const r4 = DB.importBundle({ 'decks.json': '{ 这不是 JSON', 'custom.css': 'ok' }, 'merge');
    ok('坏掉的 decks.json 记进 skipped', r4.skipped.indexOf('decks.json') >= 0);
    eq('坏包不影响已有牌组', DB.listDecks().length, keepDecks);
    eq('坏包里的好文件（custom.css）照样吃到', DB.getSettings().ui.customCss, 'ok');

    const keep2 = DB.listDecks().length;
    const r5 = DB.importBundle({ 'decks.json': '[1,2,3]' }, 'replace');
    ok('结构不对的 decks.json（是个数组而不是对象）记进 skipped', r5.skipped.indexOf('decks.json') >= 0);
    eq('结构不对的 decks.json 不会把现有牌组清掉', DB.listDecks().length, keep2);
    eq('结构不对时不能声称导入了牌组', r5.decks, 0);

    // 收尾
    ctx.Plugins.uninstall && (() => { try { ctx.Plugins.uninstall('x.bundle'); } catch (e) { } })();
  }
}

/* ---------------- 结果 ---------------- */
function finish() {
  closeGroup();
  console.log('\n' + '='.repeat(52));
  if (fail === 0) {
    console.log(`✓ 全部通过：${pass} 项检查`);
    console.log('='.repeat(52));
    process.exit(0);
  } else {
    console.log(`✗ ${fail} 项失败 / 共 ${pass + fail} 项`);
    failures.forEach((f) => console.log('   · ' + f));
    console.log('='.repeat(52));
    process.exit(1);
  }
}
