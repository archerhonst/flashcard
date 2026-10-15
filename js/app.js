/* ============================================================
 * app.js —— 界面与交互
 * ============================================================ */
(function (global) {
  'use strict';
  var U = global.U, DB = global.DB, Plugins = global.Plugins, Cloze = global.Cloze, AI = global.AI;
  var $ = U.$, $$ = U.$$, el = U.el, esc = U.esc;
  // T('中文原文', {占位符}) —— 中文下原样返回，英文下查 js/lang/en.js 的词典。详见 js/i18n.js
  var T = global.I18n.T;
  var I18n = global.I18n;
  var Game = global.Game;
  var Zip = global.Zip;

  var App = {
    route: 'study',
    deckId: U.Store.get('lastDeck', ''),
    search: '',
    openDeck: '',
    theme: 'auto',
    busy: false,
    study: {
      queue: [], idx: 0, revealed: false, done: 0, again: 0, wrong: 0,
      // 撤销栈：每评一次分压一层，用来把点错档位的卡片救回来
      undo: [],
      // 打字作答的结果 { 挖空编号: {given, ok} }，null = 还没检查
      typed: null
    },
    cz: {
      markup: '',
      tapMode: false,
      count: 3,
      oneCardPerBlank: true,
      extra: '',
      aiEngine: 'local',
      targetDeck: '',
      busy: false
    },
    pl: {
      draft: '',
      overwrite: false,
      result: null,
      editing: '',
      previewId: '',
      // 内置示例：'' 未展开 / 'load' 正在读清单 / 'ready' 清单已到手 / 'err' 读不到
      examples: '',
      examplesErr: ''
    }
  };

  /* ============================================================
   * 主题
   * ============================================================ */
  function applyTheme() {
    var t = DB.getSettings().ui.theme;
    var real = t;
    if (t === 'auto') {
      real = (global.matchMedia && global.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
    }
    document.documentElement.setAttribute('data-theme', real);
    var meta = document.querySelector('meta[name=theme-color]');
    if (meta) meta.setAttribute('content', real === 'light' ? '#f5f7fa' : '#0e1116');
    document.documentElement.style.setProperty('--fs', (DB.getSettings().ui.fontSize || 16) + 'px');
    document.documentElement.style.setProperty('--card-w', (DB.getSettings().ui.cardMaxWidth || 720) + 'px');
    applyUserCss();
  }

  /* ============================================================
   * 插件样式注入
   * ============================================================ */

  /** 插件 css 的作用域类。必须和 Plugins.cssFor() 里的前缀算法一致。 */
  function pluginScope(pluginId) {
    return ' fc-plugin-' + String(pluginId || '').replace(/[^A-Za-z0-9_-]/g, '_');
  }

  /**
   * 用户自定义 CSS（设置 → 外观）。整段原样塞进一个 <style>，不解析、不过滤——
   * 这是用户自己的样式表，和插件 css 一样属于「信任本机输入」。
   */
  function applyUserCss() {
    var node = document.getElementById('fc-user-css');
    if (!node) {
      node = document.createElement('style');
      node.id = 'fc-user-css';
      document.head.appendChild(node);
    }
    node.textContent = (DB.getSettings().ui.customCss || '');
  }

  /** 从 textarea 读回并持久化。直接读 DOM：不依赖 input 事件（粘贴/程序赋值不一定触发）。 */
  function saveUserCss(text) {
    var ta = document.getElementById('set-css');
    var v = (text === undefined || text === null) ? (ta ? ta.value : '') : text;
    var ui = DB.getSettings().ui;
    ui.customCss = v;
    DB.saveSettings({ ui: ui });
    applyUserCss();
    // CSS 生效不需要重绘 DOM，但设置页上那句「已启用/未启用」得刷新，
    // 所以重渲染一次当前路由。顺带保住光标位置没有意义（用户在按按钮，不在打字）。
    render(true);
    return v;
  }
  function refreshPluginCSS() {
    var node = document.getElementById('fc-plugin-css');
    if (!node) {
      node = document.createElement('style');
      node.id = 'fc-plugin-css';
      document.head.appendChild(node);
    }
    node.textContent = Plugins.enabledList().map(function (p) { return Plugins.cssFor(p); }).join('\n');
  }

  /* ============================================================
   * 牌组
   * ============================================================ */
  function decks() { return DB.listDecks(); }
  function currentDeck() {
    var d = DB.getDeck(App.deckId);
    if (!d) {
      var all = decks();
      d = all[0] || null;
      App.deckId = d ? d.id : '';
    }
    return d;
  }
  function setDeck(id) {
    App.deckId = id || '';
    U.Store.set('lastDeck', App.deckId);
  }
  function pluginOfDeck(deck) {
    return Plugins.get(deck ? deck.pluginId : null);
  }

  function ensureDeck() {
    var d = currentDeck();
    if (d) return Promise.resolve(d);
    return U.promptBox(T('先建一个牌组'), [
      { key: 'name', label: T('牌组名称'), value: T('我的牌组'), placeholder: T('例如：考研英语核心词') },
      {
        key: 'pluginId', label: T('卡片类型'), type: 'select',
        options: Plugins.enabledList().map(function (p) { return { value: p.id, label: p.icon + ' ' + p.name }; })
      }
    ]).then(function (r) {
      if (!r) return null;
      var nd = DB.createDeck({ name: r.name || T('我的牌组'), pluginId: r.pluginId || 'builtin.basic' });
      setDeck(nd.id);
      return nd;
    });
  }

  /* ============================================================
   * 外壳渲染
   * ============================================================ */
  // 注意：TABS 在**加载时**就构建好了，那时用户还没选语言（T 还是原样返回）。
  // 所以这里只存中文原文，真正的翻译留到渲染时做（见 renderTopbar 里的 T(t.label)）。
  // 在模块顶层直接写 T('学习') 是错的——切语言后会把标签冻在中文上。
  var TABS = [
    { id: 'study', ico: '🎯', label: '学习' },
    { id: 'cards', ico: '🗂️', label: '卡片' },
    { id: 'cloze', ico: '🕳️', label: '挖空 / AI' },
    { id: 'growth', ico: '🌱', label: '成长' },
    { id: 'plugins', ico: '🧩', label: '插件' },
    { id: 'settings', ico: '⚙️', label: '设置' }
  ];

  var lastScroll = {};

  /* ============================================================
   * 语言选择页（首次启动）
   *
   * 为什么要有这一页：词典里的 key 就是中文原文，没选语言之前 T() 一律回落中文，
   * 也就是说「没选过」等价于「选了中文」——英文用户第一次打开就会看到满屏中文，
   * 而且他连去哪儿改都不知道（设置页也是中文的）。所以要在进入 App 之前先问一次。
   *
   * 这一页自己**不能**用 T()：语言还没定呢。文案写死双语。
   * ============================================================ */

  function langChosen() {
    return !!DB.getSettings().ui.lang;
  }

  function renderGate() {
    var app = document.getElementById('app');
    app.innerHTML =
      '<div class="lang-gate">' +
        '<div class="lg-icon" aria-hidden="true">🃏</div>' +
        '<h1 class="lg-title">闪卡 · FlashCards</h1>' +
        '<p class="lg-sub">选择界面语言 · Choose your language</p>' +
        '<div class="lg-list" role="group" aria-label="Language">' +
          I18n.LANGS.map(function (l) {
            return '<button type="button" class="lg-btn" data-act="lang:pick" data-v="' + l.id + '" lang="' + (l.id === 'zh' ? 'zh-CN' : l.id) + '">' +
              '<span class="lg-native">' + esc(l.label) + '</span>' +
              '<span class="lg-en">' + esc(l.english) + '</span>' +
              '</button>';
          }).join('') +
        '</div>' +
        '<p class="lg-foot">之后可以在「设置 → 外观」里随时切换<br>' +
        'You can change this later in Settings → Appearance</p>' +
      '</div>';
  }

  /** 选好语言：存下来、切词典、重绘成正常的 App（首次还会接着走建示例牌的引导） */
  function pickLang(id) {
    var normalized = I18n.normalize(id);
    if (!normalized) return;
    DB.saveSettings({ ui: { lang: normalized } });
    I18n.setLang(normalized);
    applyTheme();
    afterLang();
  }

  function render(keepScroll) {
    // 语言没选过就只画选择页：此时界面还是中文，让英文用户先选。
    if (!langChosen()) { renderGate(); return; }

    var view = document.getElementById('view');
    if (view) lastScroll[App.route + '|' + (App.deckId || '')] = view.scrollTop;

    var g = DB.globalStats();
    var html = '';
    html += renderTopbar();
    html += '<main class="view" id="view"></main>';
    html += T('<nav class="tabbar" aria-label="主导航">') + TABS.map(function (t) {
      var badge = '';
      if (t.id === 'study' && g.due > 0) badge = '<span class="badge">' + (g.due > 99 ? '99+' : g.due) + '</span>';
      else if (t.id === 'growth' && claimableCount()) badge = '<span class="badge">' + claimableCount() + '</span>';
      var on = App.route === t.id;
      // 用 <button> 而不是 <div>：能被 Tab 聚焦、被读屏念出来、回车/空格能用
      return '<button type="button" class="tab' + (on ? ' on' : '') + '"' +
        (on ? ' aria-current="page"' : '') +
        ' data-act="nav" data-v="' + t.id + '">' +
        '<span class="tab-ico" aria-hidden="true">' + t.ico + '</span>' + T(t.label) + badge + '</button>';
    }).join('') + '</nav>';

    var app = document.getElementById('app');
    app.innerHTML = html;

    var v = document.getElementById('view');
    v.innerHTML = renderView();
    v.classList.toggle('view--center', App.route === 'study' && !App.study.queue.length);

    if (keepScroll) {
      var k = App.route + '|' + (App.deckId || '');
      v.scrollTop = lastScroll[k] || 0;
    }
    bindView();
    // 快照列表是异步读 IndexedDB 的，只能在 DOM 落地之后再填
    if (App.route === 'settings') renderSnapList();
    // 第一次进插件页时自动把内置示例清单拉回来（只跑一次：loadExamples 会先把状态置成 'load'）
    if (App.route === 'plugins' && App.pl.examples === '') loadExamples();
  }

  function renderTopbar() {
    var title = '', sub = '';
    var actions = '';
    var g = DB.globalStats();

    if (App.route === 'study') {
      var d = currentDeck();
      title = d ? d.name : T('闪卡');
      sub = d ? (pluginOfDeck(d).icon + ' ' + pluginOfDeck(d).name) : T('还没有牌组');
      actions = deckPickerHTML();
    } else if (App.route === 'cards') {
      title = T('卡片库');
      sub = g.decks + T(' 个牌组 · {n} 张卡 · 今日已复习 ', {n: g.total}) + g.reviewedToday;
      actions = T('<button class="btn btn--icon" data-act="deck:new" title="新建牌组">＋</button>');
    } else if (App.route === 'cloze') {
      title = T('挖空 & AI');
      sub = T('人工挖空 · 智能挖空 · AI 生成');
    } else if (App.route === 'growth') {
      var gp = Game.profile();
      title = T('成长');
      sub = 'Lv.' + gp.level + ' · ' + T(gp.title.name) + T(' · 连续 ') + gp.streak.current + T(' 天 · 已精通 ') +
        gp.masteredCount + T(' 张');
    } else if (App.route === 'plugins') {
      title = T('JSON 插件');
      sub = Plugins.enabledList().length + ' / ' + Plugins.all().length + T(' 个已启用');
      actions = T('<button class="btn btn--icon" data-act="pl:new" title="新建插件">＋</button>');
    } else {
      title = T('设置');
      sub = T('AI 接口 · 数据备份 · 外观');
    }

    return '<header class="topbar"><div class="topbar-main">' +
      '<div class="topbar-title">' + esc(title) + '</div>' +
      '<div class="topbar-sub">' + sub + '</div>' +
      '</div><div class="topbar-actions">' + actions + '</div></header>';
  }

  function deckPickerHTML() {
    var all = decks();
    if (!all.length) return T('<button class="btn btn--sm btn--primary" data-act="deck:new">新建牌组</button>');
    return '<select id="deck-picker" data-act="deck:select" style="max-width:150px;padding:6px 8px;font-size:.8rem">' +
      all.map(function (d) {
        return '<option value="' + esc(d.id) + '"' + (d.id === App.deckId ? ' selected' : '') + '>' +
          esc(Plugins.get(d.pluginId).icon + ' ' + d.name) + '</option>';
      }).join('') + '</select>' +
      T('<button class="btn btn--icon" data-act="deck:new" title="新建牌组">＋</button>');
  }

  function renderView() {
    switch (App.route) {
      case 'study': return viewStudy();
      case 'cards': return viewCards();
      case 'cloze': return viewCloze();
      case 'growth': return viewGrowth();
      case 'plugins': return viewPlugins();
      case 'settings': return viewSettings();
      default: return '';
    }
  }

  /* ============================================================
   * 视图：学习
   * ============================================================ */
  function startStudy(keepUndo) {
    var d = currentDeck();
    App.study.queue = d ? DB.dueCards(d.id) : [];
    App.study.idx = 0;
    App.study.revealed = false;
    App.study.done = 0;
    App.study.again = 0;
    // 换了一批卡就不能再撤销上一批的评分了，否则还原的是过期状态。
    // 但「本轮自然结束」不算换批——最后一张点错档位，正是最想撤销的时候，
    // 所以那条路径传 keepUndo=true。
    if (!keepUndo) App.study.undo = [];
    App.study.typed = null;
  }

  /* ---------- 撤销上次评分 ---------- */
  /**
   * 评分前记录「这一步之前的样子」。
   * queue 用 slice() 浅拷贝就够了——队列元素是同一批卡片对象，
   * 而 DB.schedule 是就地改 card.sched，所以真正需要深拷贝的只有这一张卡的 sched。
   */
  function pushUndo(card) {
    App.study.undo.push({
      queue: App.study.queue.slice(),
      idx: App.study.idx,
      done: App.study.done,
      again: App.study.again,
      revealed: App.study.revealed,
      typed: App.study.typed,
      cardId: card.id,
      sched: U.deepClone(card.sched)
    });
    if (App.study.undo.length > 20) App.study.undo.shift();
  }

  function undoRating() {
    var snap = App.study.undo.pop();
    if (!snap) { U.toast(T('没有可以撤销的评分了')); return; }
    DB.restoreSched(snap.cardId, snap.sched);
    App.study.queue = snap.queue;
    App.study.idx = snap.idx;
    App.study.done = snap.done;
    App.study.again = snap.again;
    App.study.revealed = snap.revealed;
    App.study.typed = snap.typed;
    render();
    U.toast(T('已撤销上一次评分'), 'ok');
  }

  /* ---------- 打字作答 ---------- */
  function typingOn() {
    return !!DB.getSettings().study.typing;
  }

  /**
   * 检查用户打的字。
   * 全对不自动跳下一张——「看到自己对了」本身就是反馈的一部分，
   * 而且这个工具的核心是用户自己判断掌握程度，替他点掉反而少了一次确认。
   */
  function checkTyping() {
    var card = App.study.queue[App.study.idx];
    if (!card) return;
    var plugin = Plugins.get(card.pluginId);
    var key = plugin && Plugins.clozeFieldKey(plugin);
    if (!key) { App.study.revealed = true; render(); return; }
    var inputs = U.$$('.cloze-input');
    var values = {};
    inputs.forEach(function (n) {
      values[parseInt(n.getAttribute('data-cloze'), 10)] = n.value;
    });
    var results = Cloze.checkTyping(card.fields[key] || '', values);
    App.study.typed = Cloze.toTypedMap(results);
    App.study.revealed = true;
    var bad = results.filter(function (r) { return !r.ok; }).length;
    if (!results.length) U.toast(T('这张卡没有挖空'));
    else if (!bad) U.toast(T('全对 ✓'), 'ok');
    else U.toast(bad + T(' 个空没答对，看看正确答案'), 'warn');
    render();
  }

  function viewStudy() {
    var d = currentDeck();
    if (!d) {
      return T('<div class="empty"><span class="empty-ico">🗂️</span>还没有牌组<br>') +
        T('<button class="btn btn--primary" style="margin-top:14px" data-act="deck:new">创建第一个牌组</button></div>');
    }
    if (!App.study.queue.length) startStudy(true);

    var q = App.study.queue;
    if (!q.length) {
      var s = DB.deckStats(d.id);
      return T('<div class="study-wrap"><div class="empty"><span class="empty-ico">🎉</span>') +
        T('<b style="color:var(--fg)">这个牌组今天已经清空了</b><br>') +
        T('待复习 ') + s.due + T(' · 新卡 {n} · 总计 ', {n: s.fresh}) + s.total + '<br>' +
        T('<button class="btn" style="margin-top:14px" data-act="study:reload">刷新队列</button> ') +
        T('<button class="btn" style="margin-top:14px" data-act="deck:addCard">加张卡</button> ') +
        (App.study.undo.length ? T('<button class="btn btn--ghost" style="margin-top:14px" data-act="study:undo">↩ 撤销上一次评分</button>') : '') +
        '</div></div>';
    }

    var card = q[App.study.idx];
    if (!card) { App.study.idx = 0; card = q[0]; }
    var plugin = Plugins.get(card.pluginId);
    var clozeKey = plugin && Plugins.clozeFieldKey(plugin);
    // 打字作答只在「还没看答案 + 是挖空卡 + 用户开了开关」时生效；
    // 普通问答卡没有空可填，只能照旧自己点显示答案。
    var typing = !App.study.revealed && typingOn() && !!clozeKey;
    var front = Plugins.renderSide(plugin, card, 'front', {
      interactive: typing,
      typed: App.study.typed
    });
    var back = Plugins.renderSide(plugin, card, 'back');
    var pct = Math.round((App.study.idx / q.length) * 100);
    var iv = DB.previewIntervals(card);
    var labels = [[T('重来'), iv[0]], [T('困难'), iv[1]], [T('良好'), iv[2]], [T('简单'), iv[3]]];
    var leech = DB.isLeech(card);

    var h = '<div class="study-wrap">';
    h += '<div class="study-progress"><span>' + (App.study.idx + 1) + ' / ' + q.length + '</span>' +
      '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
      // 用 {n} 而不是「前缀 + 数字」的拼法：英文语序是「3 left」，中文是「剩 3」，
      // 拆成两半拼接就没法换了。
      T('<span>{n} 张剩余</span>', { n: q.length - App.study.idx }) + '</div>';

    if (leech) {
      h += T('<div class="leech-banner">🩸 <b>难卡</b>：已经答错 ') + (card.sched.lapses || 0) +
        T(' 次了。多半不是记不住，而是这张卡太胖——') +
        '<button class="btn btn--sm" data-act="card:split" data-id="' + card.id + T('">✂️ 让 AI 拆开</button></div>');
    }

    h += '<div class="flip-card' + (typing ? ' flip-card--typing' : '') + '" data-act="study:reveal">';
    // 把插件的 css 作用域类挂到卡片容器本体上（而不是再套一层 div）：
    // 既让 Plugins.cssFor() 生成的 `.fc-plugin-x .foo` 规则生效，
    // 又不会因为多一层节点破坏 flip-front/back 的居中布局。
    h += '<div class="flip-front' + pluginScope(card.pluginId) + '">' + front + '</div>';
    if (App.study.revealed) {
      h += '<div class="flip-back' + pluginScope(card.pluginId) + '">' + back + '</div>';
    }
    h += '</div>';

    if (typing) {
      h += T('<div class="flip-tip">在空里打字，然后按 <span class="kbd">回车</span> 检查') +
        (App.study.typed ? '' : T('（实在想不起来可以直接按 <span class="kbd">空格</span> 看答案）')) + '</div>';
      h += T('<button class="btn btn--primary btn--block" style="margin-top:12px;padding:13px" data-act="study:check">检查</button>');
      h += T('<button class="btn btn--block btn--ghost" style="margin-top:8px" data-act="study:reveal">想不起来，直接看答案</button>');
    } else if (!App.study.revealed) {
      h += T('<div class="flip-tip">点击卡片或按 <span class="kbd">空格</span> 显示答案</div>');
      h += T('<button class="btn btn--primary btn--block" style="margin-top:12px;padding:13px" data-act="study:reveal">显示答案</button>');
    } else {
      h += '<div class="rating">' + labels.map(function (l, i) {
        return '<button class="rate" data-act="study:rate" data-r="' + i + '">' + l[0] +
          '<small>' + fmtIv(l[1]) + '</small></button>';
      }).join('') + '</div>';
    }

    h += '<div class="row row--wrap" style="margin-top:14px;gap:8px">' +
      '<button class="btn btn--sm btn--ghost" data-act="card:edit" data-id="' + card.id + T('">✏️ 编辑</button>') +
      '<button class="btn btn--sm btn--ghost" data-act="card:suspend" data-id="' + card.id + T('">⏸ 暂停</button>') +
      '<button class="btn btn--sm btn--ghost" data-act="card:del" data-id="' + card.id + T('">🗑 删除</button>') +
      (App.study.undo.length ? T('<button class="btn btn--sm btn--ghost" data-act="study:undo">↩ 撤销评分</button>') : '') +
      '<span class="grow"></span>' +
      T('<span class="muted">本轮 完成 ') + App.study.done + T(' · 重来 ') + App.study.again + '</span>' +
      '</div>';

    h += '</div>';
    return h;
  }

  function fmtIv(days) {
    if (!days) return T('10 分钟');
    if (days < 1) return Math.round(days * 24) + T(' 小时');
    if (days < 30) return days + T(' 天');
    if (days < 365) return (days / 30).toFixed(1) + T(' 月');
    return (days / 365).toFixed(1) + T(' 年');
  }

  function rateCard(r) {
    var q = App.study.queue;
    var card = q[App.study.idx];
    if (!card) return;
    pushUndo(card);          // 先留一份「评分前」的样子，点错档位还能救
    // 成长反馈：评分前后各取一次角色档案，diff 出这一下挣到的经验 / 升级 / 新徽章。
    // 放在 DB.schedule 两侧是因为 store 的 onReview 钩子就在 schedule 内部触发。
    var gBefore = Game ? Game.profile() : null;
    DB.schedule(card, r);
    var gAfter = Game ? Game.profile() : null;
    App.study.done++;
    if (r === 0) {
      App.study.again++;
      q.push(card);            // 10 分钟后重来：本轮内再考一次
    }
    App.study.idx++;
    App.study.revealed = false;
    App.study.typed = null;
    var grew = (gBefore && gAfter) ? growthFlash(gBefore, gAfter) : '';
    if (grew) U.toast(grew, 'ok');
    if (App.study.idx >= q.length) {
      U.toast(T('本轮完成！共 {n} 次', {n: App.study.done}), 'ok');
      // keepUndo：这一批是自然结束的，撤销栈对刚评完的那张卡依然有效
      startStudy(true);
    }
    render();
  }

  /* ============================================================
   * 视图：卡片
   * ============================================================ */
  function viewCards() {
    if (App.search || App.openDeck) return viewDeckDetail();
    var all = decks();
    var h = '';
    var g = DB.globalStats();
    h += '<div class="stats" style="margin-bottom:14px">' +
      '<div class="stat stat--total"><b>' + g.total + T('</b><span>总卡片</span></div>') +
      '<div class="stat stat--due"><b>' + g.due + T('</b><span>待复习</span></div>') +
      '<div class="stat stat--new"><b>' + g.fresh + T('</b><span>新卡</span></div>') +
      '<div class="stat"><b>' + g.reviewedToday + T('</b><span>今日复习</span></div>') +
      '</div>';

    if (!all.length) {
      return h + T('<div class="empty"><span class="empty-ico">📭</span>还没有牌组<br>') +
        T('<button class="btn btn--primary" style="margin-top:14px" data-act="deck:new">新建牌组</button> ') +
        T('<button class="btn" style="margin-top:14px" data-act="data:import">导入备份</button></div>');
    }

    h += '<div class="list">';
    all.forEach(function (d) {
      var s = DB.deckStats(d.id);
      var p = Plugins.get(d.pluginId);
      h += '<div class="item" data-act="deck:open" data-id="' + esc(d.id) + '">' +
        '<div class="item-ico">' + p.icon + '</div>' +
        '<div class="item-main"><div class="item-title">' + esc(d.name) + '</div>' +
        '<div class="item-sub"><span>' + esc(p.name) + '</span>' +
        (s.due ? '<b>' + s.due + T(' 待复习</b>') : '') +
        (s.fresh ? '<i>' + s.fresh + T(' 新卡</i>') : '') +
        T('<span>共 ') + s.total + '</span></div></div>' +
        T('<div class="item-tail">›</div></div>');
    });
    h += '</div>';
    return h;
  }

  function viewDeckDetail() {
    var d = DB.getDeck(App.openDeck);
    if (!d) { App.openDeck = ''; return viewCards(); }
    var p = Plugins.get(d.pluginId);
    var s = DB.deckStats(d.id);
    var cards = DB.listCards(d.id);
    if (App.search) {
      var q = App.search.toLowerCase();
      cards = cards.filter(function (c) {
        return JSON.stringify(c.fields).toLowerCase().indexOf(q) >= 0 ||
          (c.tags || []).join(' ').toLowerCase().indexOf(q) >= 0;
      });
    }

    var h = '<div class="row" style="margin-bottom:12px">' +
      T('<button class="btn btn--sm btn--ghost" data-act="deck:back">‹ 返回</button>') +
      '<span class="grow"></span>' +
      '<button class="btn btn--sm" data-act="deck:ai" data-id="' + esc(d.id) + T('">🤖 AI 生成</button>') +
      '<button class="btn btn--sm" data-act="deck:bulk" data-id="' + esc(d.id) + T('">📥 批量导入</button>') +
      '</div>';

    h += '<div class="card-panel"><div class="row row--between" style="margin-bottom:8px">' +
      '<b>' + esc(d.name) + '</b><span class="chip">' + p.icon + ' ' + esc(p.name) + '</span></div>' +
      T('<div class="item-sub" style="gap:12px"><span>共 ') + s.total + '</span><b>' + s.due + T(' 待复习</b>') +
      '<i>' + s.fresh + T(' 新卡</i><span>熟练 ') + s.mature + '</span></div>' +
      '<div class="hr"></div>' +
      '<div class="row row--wrap" style="gap:8px">' +
      '<button class="btn btn--sm" data-act="card:new" data-deck="' + esc(d.id) + T('">＋ 新卡</button>') +
      '<button class="btn btn--sm" data-act="deck:edit" data-id="' + esc(d.id) + T('">牌组设置</button>') +
      '<button class="btn btn--sm" data-act="deck:export" data-id="' + esc(d.id) + T('">导出</button>') +
      '<button class="btn btn--sm btn--danger" data-act="deck:del" data-id="' + esc(d.id) + T('">删除牌组</button>') +
      '</div></div>';

    h += T('<input type="search" id="card-search" placeholder="搜索卡片内容或标签…" value="') + esc(App.search) + '" style="margin-bottom:12px">';

    if (!cards.length) {
      h += T('<div class="empty"><span class="empty-ico">🃏</span>') +
        (App.search ? T('没有匹配的卡片') : T('这个牌组还是空的')) + '</div>';
    } else {
      h += '<div class="list">' + cards.slice(0, 300).map(function (c) {
        var front = Plugins.renderSide(p, c, 'front').replace(/<[^>]+>/g, '').slice(0, 60);
        var st = c.sched.reps === 0 ? T('新卡') : (T('下次 ') + U.fmtDue(c.sched.due));
        var curveLabel = T('遗忘曲线');
        return '<div class="item" data-act="card:edit" data-id="' + esc(c.id) + '">' +
          '<div class="item-main"><div class="item-title">' + esc(front) + '</div>' +
          '<div class="item-sub">' + masteryPips(c) +
          (DB.isSleeping(c) ? T('<b class="is-sleep">💤 已休眠</b>') : '') +
          '<span>' + esc(st) + '</span>' +
          (c.sched.reps ? T('<span>复习 ') + c.sched.reps + T(' 次</span>') : '') +
          (c.tags && c.tags.length ? '<span>#' + esc(c.tags.join(' #')) + '</span>' : '') +
          T('</div></div><div class="item-tail">') +
          '<button type="button" class="btn btn--icon btn--ghost" data-act="card:curve" data-id="' + esc(c.id) +
          '" title="' + esc(curveLabel) + '" aria-label="' + esc(curveLabel) + '">📉</button>' +
          '›</div></div>';
      }).join('') + '</div>';
      if (cards.length > 300) h += T('<div class="muted" style="text-align:center;padding:12px">只显示前 300 张，请用搜索缩小范围</div>');
    }
    return h;
  }

  /* -------- 卡片编辑器 -------- */
  function openCardEditor(card, deckId) {
    var deck = DB.getDeck(deckId || (card && card.deckId)) || currentDeck();
    if (!deck) { U.toast(T('请先创建牌组'), 'error'); return; }
    var plugin = Plugins.get(card ? card.pluginId : deck.pluginId);
    var fields = card ? U.deepClone(card.fields) : Plugins.defaultFields(plugin);
    var allowPluginSwitch = !card;

    var body = '';
    if (allowPluginSwitch) {
      body += T('<label class="field"><span>卡片类型</span><select data-field="__plugin">') +
        Plugins.enabledList().map(function (p) {
          return '<option value="' + esc(p.id) + '"' + (p.id === plugin.id ? ' selected' : '') + '>' +
            p.icon + ' ' + esc(p.name) + '</option>';
        }).join('') + '</select></label>';
    }
    body += '<div id="cf-fields">' + plugin.fields.map(function (f) { return fieldHTML(f, fields[f.key]); }).join('') + '</div>';
    body += T('<label class="field"><span>标签（逗号分隔）</span><input type="text" data-field="__tags" value="') +
      esc(card ? (card.tags || []).join(', ') : '') + '"></label>';

    var actions = (card ? T('<button class="btn btn--danger" data-act="m:del">删除</button>') : '') +
      '<span class="grow"></span>' +
      T('<button class="btn btn--ghost" data-act="m:close">取消</button>') +
      T('<button class="btn btn--primary" data-act="m:save">保存</button>');

    var modal = openModal((card ? T('编辑卡片') : T('新建卡片')) + ' · ' + esc(deck.name), body, actions);

    function collect() {
      var out = { fields: {}, tags: [] };
      $$('[data-field]', modal).forEach(function (n) {
        var k = n.getAttribute('data-field');
        if (k === '__tags') {
          out.tags = n.value.split(/[,，、]/).map(function (s) { return s.trim(); }).filter(Boolean);
        } else if (k === '__plugin') {
          out.pluginId = n.value;
        } else if (n.type === 'checkbox') {
          out.fields[k] = n.checked ? 'true' : 'false';
        } else {
          out.fields[k] = n.value;
        }
      });
      return out;
    }

    modal.addEventListener('change', function (e) {
      var n = e.target;
      if (n.getAttribute && n.getAttribute('data-field') === '__plugin') {
        var np = Plugins.get(n.value);
        var box = document.getElementById('cf-fields');
        if (box) {
          var defs = Plugins.defaultFields(np);
          box.innerHTML = np.fields.map(function (f) { return fieldHTML(f, defs[f.key]); }).join('');
        }
        plugin = np;
      }
    });

    modal.addEventListener('click', function (e) {
      var act = e.target.getAttribute && e.target.getAttribute('data-act');
      if (act === 'm:close') { closeModal(modal); return; }
      if (act === 'm:del') {
        U.confirmBox(T('删除卡片'), T('删除后不可恢复，确定吗？'), T('删除')).then(function (ok) {
          if (!ok) return;
          DB.deleteCard(card.id);
          closeModal(modal);
          U.toast(T('已删除'), 'ok');
          render(true);
        });
        return;
      }
      if (act === 'm:save') {
        var data = collect();
        var pid = data.pluginId || plugin.id;
        var miss = Plugins.get(pid).fields.filter(function (f) { return f.required && !String(data.fields[f.key] || '').trim(); });
        if (miss.length) { U.toast(T('请填写：') + miss.map(function (f) { return f.label; }).join(T('、')), 'error'); return; }
        if (card) {
          DB.updateCard(card.id, { fields: data.fields, tags: data.tags, pluginId: pid });
          U.toast(T('已保存'), 'ok');
        } else {
          makeCards(deck.id, pid, data.fields, data.tags);
        }
        closeModal(modal);
        render(true);
      }
    });
  }

  // 依据卡型决定生成一张还是多张（挖空卡按空拆）
  function makeCards(deckId, pluginId, fields, tags) {
    var plugin = Plugins.get(pluginId);
    if (plugin.mode === 'cloze') {
      var key = Plugins.clozeFieldKey(plugin);
      var markup = fields[key] || '';
      var one = DB.getSettings().cloze.oneCardPerBlank !== false;
      var defs = Cloze.toCards(markup, { oneCardPerBlank: one, extra: fields.extra || '' });
      if (!defs.length) { U.toast(T('没有检测到挖空标记 {{c1::…}}'), 'error'); return []; }
      var created = DB.createCardsBulk(defs.map(function (d) {
        return { deckId: deckId, pluginId: pluginId, fields: fields, tags: tags, clozeIndex: d.clozeIndex };
      }));
      U.toast(T('已生成 {n} 张卡片', {n: created.length}), 'ok');
      return created;
    }
    var c = DB.createCard(deckId, pluginId, fields, tags);
    U.toast(T('已保存'), 'ok');
    return [c];
  }

  function fieldHTML(f, value) {
    var t = f.type || 'text';
    var v = value === undefined || value === null ? '' :
      (Array.isArray(value) ? value.join('\n') : String(value));
    var inner;
    if (t === 'textarea' || t === 'cloze') {
      inner = '<textarea data-field="' + esc(f.key) + '" placeholder="' + esc(f.placeholder || '') + '"' +
        (t === 'cloze' ? ' class="cloze-src"' : '') + '>' + esc(v) + '</textarea>';
    } else if (t === 'list' || t === 'tags') {
      inner = '<textarea data-field="' + esc(f.key) + '" placeholder="' + esc(f.placeholder || T('每行一个')) + '" style="min-height:64px">' + esc(v) + '</textarea>';
    } else if (t === 'select') {
      inner = '<select data-field="' + esc(f.key) + '">' + (f.options || []).map(function (o) {
        var val = o.value !== undefined ? o.value : o;
        var lab = o.label !== undefined ? o.label : o;
        return '<option value="' + esc(val) + '"' + (String(val) === v ? ' selected' : '') + '>' + esc(lab) + '</option>';
      }).join('') + '</select>';
    } else if (t === 'checkbox') {
      inner = '<label class="switch"><input type="checkbox" data-field="' + esc(f.key) + '"' +
        (v === 'true' ? ' checked' : '') + T('><span class="track"></span><span>启用</span></label>');
    } else {
      inner = '<input type="' + (t === 'number' ? 'number' : 'text') + '" data-field="' + esc(f.key) +
        '" value="' + esc(v) + '" placeholder="' + esc(f.placeholder || '') + '">';
    }
    return '<label class="field"><span>' + esc(f.label) + (f.required ? ' *' : '') + '</span>' + inner +
      (f.hint ? '<span class="hint">' + esc(f.hint) + '</span>' : '') +
      (t === 'cloze' ? T('<span class="hint">用 {{c1::答案}} 标记挖空，可加提示 {{c1::答案::提示}}</span>') : '') +
      '</label>';
  }

  /* ============================================================
   * 视图：挖空 / AI
   * ============================================================ */
  function viewCloze() {
    var all = decks();
    var target = App.cz.targetDeck || App.deckId || (all[0] && all[0].id) || '';
    App.cz.targetDeck = target;

    var h = '';

    /* ---- 目标牌组 ---- */
    h += T('<div class="card-panel"><div class="section-title">目标牌组') +
      T('<button class="btn btn--sm btn--ghost" data-act="deck:new">＋新建</button></div>');
    if (!all.length) {
      h += T('<div class="muted">还没有牌组，先新建一个（挖空卡建议选「🕳️ 挖空（Cloze）」类型）。</div>');
    } else {
      h += '<select data-act="cz:target">' + all.map(function (d) {
        return '<option value="' + esc(d.id) + '"' + (d.id === target ? ' selected' : '') + '>' +
          Plugins.get(d.pluginId).icon + ' ' + esc(d.name) + '</option>';
      }).join('') + '</select>';
    }
    h += '</div>';

    /* ---- 工作台 ---- */
    h += T('<div class="card-panel"><div class="section-title">挖空工作台</div>') +
      '<div class="cloze-grid">' +
      T('<textarea class="cloze-src" id="cz-src" placeholder="把要背的材料粘进来，然后：\n· 选中文字点「挖空选中」\n· 或打开「点词挖空」直接戳词\n· 或点「智能挖空」自动出空">') + esc(App.cz.markup) + '</textarea>';

    h += '<div class="seg">' +
      '<button class="' + (App.cz.tapMode ? '' : 'on') + T('" data-act="cz:mode" data-v="edit">✍️ 文本编辑</button>') +
      '<button class="' + (App.cz.tapMode ? 'on' : '') + T('" data-act="cz:mode" data-v="tap">👆 点词挖空</button>') +
      '</div>';

    h += '<div class="row row--wrap" style="gap:8px">' +
      T('<button class="btn btn--sm" data-act="cz:wrap">挖空选中</button>') +
      T('<button class="btn btn--sm" data-act="cz:unwrap">取消选中挖空</button>') +
      T('<button class="btn btn--sm btn--ghost" data-act="cz:clear">清空</button>') +
      '</div>';

    h += '<div class="row row--between" style="gap:8px">' +
      T('<span class="muted">自动挖空数量</span>') +
      '<input type="number" id="cz-count" min="1" max="30" value="' + App.cz.count + '" style="width:80px;text-align:center">' +
      '</div>';

    h += '<div class="seg">' +
      '<button class="' + (App.cz.aiEngine === 'local' ? 'on' : '') + T('" data-act="cz:engine" data-v="local">⚡ 本地智能挖空</button>') +
      '<button class="' + (App.cz.aiEngine === 'ai' ? 'on' : '') + T('" data-act="cz:engine" data-v="ai">🤖 AI 挖空</button>') +
      '</div>';

    h += '<button class="btn btn--primary btn--block" data-act="cz:auto" style="padding:12px"' +
      (App.cz.busy ? ' disabled' : '') + '>' +
      (App.cz.busy ? T('<span class="spin"></span> 生成中…') :
        (App.cz.aiEngine === 'ai' ? T('🤖 用 AI 生成挖空') : T('⚡ 本地智能挖空'))) + '</button>';

    if (App.cz.tapMode) {
      h += T('<div class="muted">👆 点击下面的词即可挖空 / 取消挖空</div>');
      h += '<div class="cloze-preview" id="cz-preview">' + czPreviewHTML() + '</div>';
    } else {
      h += T('<div class="muted">预览</div>');
      h += '<div class="cloze-preview" id="cz-preview">' +
        (Cloze.hasCloze(App.cz.markup) ? Cloze.render(App.cz.markup, { mode: 'edit' }) : T('<span class="muted">还没有挖空</span>')) +
        '</div>';
    }

    h += T('<label class="field" style="margin:0"><span>补充说明（选填）</span>') +
      T('<textarea id="cz-extra" style="min-height:56px" placeholder="显示在答案下方">') + esc(App.cz.extra) + '</textarea></label>';

    h += '<label class="switch"><input type="checkbox" id="cz-one"' + (App.cz.oneCardPerBlank ? ' checked' : '') +
      T('><span class="track"></span><span>每个空单独一张卡（关掉则整段一张卡）</span></label>');

    h += T('<button class="btn btn--primary btn--block" data-act="cz:save" style="padding:12px">💾 保存到牌组</button>');
    h += '</div></div>';

    /* ---- AI 拆卡 ---- */
    h += T('<div class="card-panel"><div class="section-title">🤖 AI 拆卡（整段材料 → 多张卡）</div>') +
      T('<div class="muted" style="margin-bottom:8px">使用目标牌组的卡型模板与提示词。') +
      T('<a href="#" data-act="nav" data-v="plugins" style="color:var(--primary)">去插件页</a> 可以自定义提示词。</div>') +
      T('<label class="field"><span>材料</span><textarea id="ai-text" placeholder="粘贴文章 / 笔记 / 教材段落…" style="min-height:110px"></textarea></label>') +
      T('<div class="row row--between"><span class="muted">卡片数量</span>') +
      '<input type="number" id="ai-count" min="1" max="50" value="5" style="width:80px;text-align:center"></div>' +
      '<div class="seg" style="margin-top:10px">' +
      '<button class="' + (App.cz.aiEngine === 'local' ? 'on' : '') + T('" data-act="cz:engine" data-v="local">⚡ 本地</button>') +
      '<button class="' + (App.cz.aiEngine === 'ai' ? 'on' : '') + T('" data-act="cz:engine" data-v="ai">🤖 AI</button>') +
      '</div>' +
      '<button class="btn btn--primary btn--block" data-act="cz:gencards" style="margin-top:10px;padding:12px"' +
      (App.cz.busy ? ' disabled' : '') + '>' + (App.cz.busy ? T('<span class="spin"></span> 生成中…') : T('✨ 生成卡片')) + '</button>' +
      '</div>';

    return h;
  }

  function czPreviewHTML() {
    var parsed = Cloze.parse(App.cz.markup);
    var toks = Cloze.segmentWords(parsed.plain);
    var spans = parsed.spans;
    var out = '';
    toks.forEach(function (t) {
      var isSpace = !t.text.trim();
      if (isSpace) { out += '<span class="space">' + esc(t.text) + '</span>'; return; }
      var clozed = spans.some(function (s) { return s.pStart <= t.start && s.pEnd >= t.end; });
      out += '<span class="tok' + (clozed ? ' clozed' : '') + '" data-act="cz:word" data-s="' + t.start + '" data-e="' + t.end + '">' +
        esc(t.text) + '</span>';
    });
    return out;
  }

  function czSync(textarea) {
    var ta = textarea || document.getElementById('cz-src');
    if (ta) App.cz.markup = ta.value;
  }

  function czUpdatePreview() {
    var box = document.getElementById('cz-preview');
    if (!box) return;
    box.innerHTML = App.cz.tapMode ? czPreviewHTML() :
      (Cloze.hasCloze(App.cz.markup) ? Cloze.render(App.cz.markup, { mode: 'edit' }) : T('<span class="muted">还没有挖空</span>'));
  }

  function czWrapSelection() {
    var ta = document.getElementById('cz-src');
    if (!ta) return;
    var s = ta.selectionStart, e = ta.selectionEnd;
    if (s === e) { U.toast(T('先在文本框里选中一段文字'), 'error'); return; }
    App.cz.markup = ta.value;
    var parsed = Cloze.parse(App.cz.markup);
    // 把 markup 选区换算成明文区间
    var pStart = -1, pEnd = -1;
    for (var i = 0; i < parsed.map.length; i++) {
      if (pStart < 0 && parsed.map[i] >= s) pStart = i;
      if (parsed.map[i] < e) pEnd = i + 1;
    }
    if (pStart < 0 || pEnd <= pStart) { U.toast(T('选区落在挖空标记内部，换个位置'), 'error'); return; }
    var r = Cloze.toggle(App.cz.markup, pStart, pEnd, {});
    App.cz.markup = r.markup;
    ta.value = r.markup;
    ta.focus();
    var newStart = r.markup.indexOf('::');
    czUpdatePreview();
  }

  function czUnwrapSelection() {
    var ta = document.getElementById('cz-src');
    if (!ta) return;
    var s = ta.selectionStart, e = ta.selectionEnd;
    var parsed = Cloze.parse(ta.value);
    var hit = parsed.spans.filter(function (sp) { return sp.mStart < e && sp.mEnd > s; });
    if (!hit.length) { U.toast(T('选区内没有挖空标记'), 'error'); return; }
    var copy = ta.value;
    hit.slice().sort(function (a, b) { return b.mStart - a.mStart; }).forEach(function (sp) {
      copy = copy.slice(0, sp.mStart) + sp.answer + copy.slice(sp.mEnd);
    });
    App.cz.markup = copy;
    ta.value = copy;
    czUpdatePreview();
    U.toast(T('已取消 {n} 处挖空', {n: hit.length}), 'ok');
  }

  function czSmart() {
    var ta = document.getElementById('cz-src');
    czSync(ta);
    var text = Cloze.strip(App.cz.markup);
    if (!text.trim()) { U.toast(T('先粘贴一些材料'), 'error'); return; }
    var count = App.cz.count;

    if (App.cz.aiEngine === 'local') {
      var r = Cloze.localAuto(text, { count: count });
      if (!r.spans.length) { U.toast(T('没找到合适的挖空候选，换个更长的材料试试'), 'error'); return; }
      App.cz.markup = r.markup;
      if (ta) ta.value = r.markup;
      czUpdatePreview();
      U.toast(T('本地挖空完成：{n} 个空', {n: r.spans.length}), 'ok');
      return;
    }

    App.cz.busy = true;
    render(true);
    AI.aiCloze(text, count, 'builtin.cloze').then(function (res) {
      App.cz.busy = false;
      if (!res.ok) {
        U.toast(T('AI 失败，已用本地兜底：') + res.error, 'error');
        var lr = Cloze.localAuto(text, { count: count });
        App.cz.markup = lr.markup;
      } else {
        App.cz.markup = res.markup;
        U.toast(T('AI 挖空完成'), 'ok');
      }
      render(true);
    });
  }

  function czGenerateCards() {
    var ta = document.getElementById('ai-text');
    var text = ta ? ta.value : '';
    if (!text.trim()) { U.toast(T('先粘贴材料'), 'error'); return; }
    var count = parseInt(($('#ai-count') || {}).value, 10) || 5;
    var deckId = App.cz.targetDeck;
    var deck = DB.getDeck(deckId);
    if (!deck) { U.toast(T('请先选择目标牌组'), 'error'); return; }
    var pluginId = deck.pluginId;
    var plugin = Plugins.get(pluginId);

    App.cz.busy = true;
    render(true);
    AI.generate(text, {
      count: count,
      pluginId: pluginId,
      kind: Plugins.aiKind(plugin),
      engine: App.cz.aiEngine
    }).then(function (res) {
      App.cz.busy = false;
      if (!res.ok) { U.toast(res.error, 'error'); render(true); return; }
      if (res.fallback) U.toast(T('AI 不可用，已用本地规则生成（效果有限）'), 'error');

      var n = 0;
      if (plugin.mode === 'cloze' || res.markup) {
        var markup = res.markup || '';
        var one = DB.getSettings().cloze.oneCardPerBlank !== false;
        var defs = Cloze.toCards(markup, { oneCardPerBlank: one });
        var fields = Plugins.defaultFields(plugin);
        fields[Plugins.clozeFieldKey(plugin)] = markup;
        DB.createCardsBulk(defs.map(function (d) {
          return { deckId: deckId, pluginId: pluginId, fields: fields, clozeIndex: d.clozeIndex };
        }));
        n = defs.length;
      } else {
        (res.cards || []).forEach(function (f) {
          DB.createCard(deckId, pluginId, f, []);
          n++;
        });
      }
      U.toast(T('生成 {n} 张卡片，已存入「', {n: n}) + deck.name + T('」'), 'ok');
      setDeck(deckId);
      App.route = 'study';
      startStudy();
      render();
    });
  }

  /* ============================================================
   * 视图：插件
   * ============================================================ */
  function viewPlugins() {
    var list = Plugins.all();
    var h = '';

    h += T('<div class="card-panel"><div class="section-title">安装 JSON 插件</div>') +
      T('<div class="muted" style="margin-bottom:8px">插件就是一个 .json 文件，声明字段、模板和 AI 提示词。') +
      T('<a href="#" data-act="pl:doc" style="color:var(--primary)">查看开发文档</a></div>') +
      '<div class="row row--wrap" style="gap:8px;margin-bottom:10px">' +
      T('<button class="btn btn--sm" data-act="pl:fromFile">📂 选择 .json 文件</button>') +
      T('<button class="btn btn--sm" data-act="pl:new">✏️ 手动编写</button>') +
      T('<button class="btn btn--sm" data-act="pl:fromUrl">🌐 从网址安装</button>') +
      '</div>' +
      T('<textarea id="pl-paste" class="code-area" style="min-height:130px" placeholder=\'粘贴插件 JSON，例如：\n{\n  "id": "my.deck",\n  "name": "我的卡型",\n  "apiVersion": 1,\n  "fields": [...],\n  "templates": { "front": "...", "back": "..." }\n}\'></textarea>') +
      '<label class="switch" style="margin:10px 0"><input type="checkbox" id="pl-overwrite"' +
      (App.pl.overwrite ? ' checked' : '') + T('><span class="track"></span><span>覆盖同 id 的已有插件</span></label>') +
      T('<button class="btn btn--primary btn--block" data-act="pl:install">安装</button>') +
      '</div>';

    // 内置示例：装在 APK 里时插件目录没法用文件选择器打开，
    // 所以由 App 自己把 plugins/index.json 读回来列出来，点一下就能装。
    if (App.pl.examples !== '') {
      h += T('<div class="card-panel"><div class="section-title">内置示例插件') +
        '<button class="btn btn--sm" style="float:right" data-act="pl:examples-toggle">' +
        (App.pl.examples === 'ready' || App.pl.examples === 'load' ? T('收起') : T('加载')) + '</button></div>';
      if (App.pl.examples === 'load') {
        h += T('<div class="muted">正在读取 plugins/index.json …</div>');
      } else if (App.pl.examples === 'err') {
        h += T('<div class="msg msg--warn">读不到内置示例（') + esc(App.pl.examplesErr || T('未知原因')) + T('）。') +
          T('直接开 index.html 时浏览器会拦下这个读取，改用本地服务器打开即可；') +
          T('也可以在仓库里手动打开 <span class="mono">plugins/</span> 目录复制 JSON。</div>');
      } else {
        h += T('<div class="muted" style="margin-bottom:8px">下面是随 App 一起打包的示例卡型，点「安装」即可加入。</div>');
        (App.pl.examplesList || []).forEach(function (ex) {
          // 清单里的一条也要跟着语言走（name/tags/desc 写在 index.json 的 i18n 里）
          ex = Plugins.localizeMeta(ex);
          // 用 Plugins.has() 判断，不能用 get()：get() 有「找不到就回落到第一个插件」的兜底，
          // 任何没装过的 id 都会返回真值，于是每个示例都显示成「重新安装」。
          var installed = Plugins.has(ex.id);
          h += '<div class="item" style="align-items:flex-start">' +
            '<div class="item-ico">' + esc(ex.icon || T('🧩')) + '</div>' +
            '<div class="item-main">' +
            '<div class="item-title">' + esc(ex.name) +
            (ex.tags ? ' <span class="chip" style="font-size:.62rem">' + esc(ex.tags) + '</span>' : '') + '</div>' +
            '<div class="muted" style="margin-top:4px">' + esc(ex.desc || '') + '</div>' +
            '<div class="row" style="gap:6px;margin-top:8px">' +
            '<button class="btn btn--sm' + (installed ? '' : ' btn--primary') + '" data-act="pl:example-install" data-file="' + esc(ex.file) + '">' +
            (installed ? T('重新安装') : T('安装')) + '</button>' +
            '<span class="muted mono" style="font-size:.7rem">' + esc(ex.file) + '</span>' +
            '</div></div></div>';
        });
      }
      h += '</div>';
    }

    if (App.pl.result) {
      var r = App.pl.result;
      h += '<div class="card-panel">';
      if (r.errors && r.errors.length) h += T('<div class="msg msg--err"><b>✕ 校验失败</b><br>') + r.errors.map(esc).join('<br>') + '</div>';
      if (r.warnings && r.warnings.length) h += T('<div class="msg msg--warn"><b>⚠ 提示</b><br>') + r.warnings.map(esc).join('<br>') + '</div>';
      if (r.ok) h += T('<div class="msg msg--ok">✓ 安装成功：') + esc(r.name || '') + '</div>';
      h += '</div>';
    }

    h += T('<div class="section-title">已安装（') + list.length + T('）</div>');
    h += '<div class="list">';
    list.forEach(function (p) {
      var on = p.enabled !== false;
      h += '<div class="item" style="align-items:flex-start">' +
        '<div class="item-ico">' + esc(p.icon || T('🧩')) + '</div>' +
        '<div class="item-main">' +
        '<div class="item-title">' + esc(p.name) +
        (p.builtin ? T(' <span class="chip" style="font-size:.62rem">内置</span>') : '') +
        (!on ? T(' <span class="chip" style="font-size:.62rem;color:var(--fg-3)">已停用</span>') : '') + '</div>' +
        '<div class="item-sub"><span class="mono">' + esc(p.id) + '</span><span>v' + esc(p.version || '1.0.0') + '</span>' +
        '<span>' + p.fields.length + T(' 字段</span><span>模式 ') + esc(p.mode || 'template') + '</span></div>' +
        (p.description ? '<div class="muted" style="margin-top:5px">' + esc(p.description) + '</div>' : '') +
        '<div class="row row--wrap" style="gap:6px;margin-top:9px">' +
        '<button class="btn btn--sm" data-act="pl:preview" data-id="' + esc(p.id) + T('">预览</button>') +
        '<button class="btn btn--sm" data-act="pl:edit" data-id="' + esc(p.id) + T('">查看/编辑 JSON</button>') +
        '<button class="btn btn--sm btn--ghost" data-act="pl:export" data-id="' + esc(p.id) + T('">导出</button>') +
        '<button class="btn btn--sm btn--ghost" data-act="pl:toggle" data-id="' + esc(p.id) + '" data-on="' + (on ? '0' : '1') + '">' +
        (on ? T('停用') : T('启用')) + '</button>' +
        // 内置插件不给「删除」按钮：它的代码在包里，删不掉，只能停用。
        // 以前这里写成 (p.builtin ? T('停用') : T('删除'))，于是内置插件并排出现
        // **两个一模一样的「停用」**，点哪个都只是停用，纯属误导。
        (p.builtin ? '' :
          '<button class="btn btn--sm btn--danger" data-act="pl:del" data-id="' + esc(p.id) + '">' + T('删除') + '</button>') +
        '</div></div></div>';
    });
    h += '</div>';

    if (App.pl.previewId) {
      var pp = Plugins.get(App.pl.previewId);
      var demoFields = Plugins.defaultFields(pp);
      pp.fields.forEach(function (f, i) {
        if (!demoFields[f.key]) demoFields[f.key] = T('【{n} 示例】', {n: f.label}) + (i === 0 ? T(' 这是正面内容') : T(' 这是背面内容'));
      });
      if (pp.mode === 'cloze') {
        var ck = Plugins.clozeFieldKey(pp);
        demoFields[ck] = T('细胞呼吸的场所是{{c1::线粒体}}，其产物包括{{c2::二氧化碳}}和{{c3::水::化学式 H2O}}。');
      }
      var fakeCard = { id: 'preview', pluginId: pp.id, fields: demoFields, tags: [], clozeIndex: 0, deckId: '' };
      h += T('<div class="card-panel"><div class="section-title">预览 · ') + esc(pp.name) +
        T('<button class="btn btn--sm btn--ghost" data-act="pl:preview-close">关闭</button></div>') +
        '<div class="' + pluginScope(pp.id).trim() + '">' +
        T('<div class="muted" style="margin-bottom:6px">正面</div>') +
        '<div class="plugin-preview">' + Plugins.renderSide(pp, fakeCard, 'front') + '</div>' +
        T('<div class="muted" style="margin:10px 0 6px">背面</div>') +
        '<div class="plugin-preview">' + Plugins.renderSide(pp, fakeCard, 'back') + '</div>' +
        '</div></div>';
    }

    return h;
  }

  function openPluginEditor(plugin) {
    var isNew = !plugin;
    var jsonText = plugin ? Plugins.exportPlugin(plugin.id) : samplePluginJSON();
    var body = '<textarea id="pl-json" class="code-area" spellcheck="false">' + esc(jsonText) + '</textarea>' +
      '<div id="pl-json-msg" style="margin-top:10px"></div>';
    var actions = T('<button class="btn btn--ghost" data-act="m:validate">校验</button>') +
      '<span class="grow"></span>' +
      T('<button class="btn btn--ghost" data-act="m:close">取消</button>') +
      '<button class="btn btn--primary" data-act="m:save">' + (isNew ? T('安装') : T('保存')) + '</button>';
    var modal = openModal(isNew ? T('新建插件') : T('编辑插件 · ') + esc(plugin.name), body, actions);

    function check() {
      var txt = $('#pl-json', modal).value;
      var msgBox = $('#pl-json-msg', modal);
      var obj;
      try { obj = JSON.parse(txt); }
      catch (e) {
        msgBox.innerHTML = T('<div class="msg msg--err">JSON 语法错误：') + esc(e.message) + '</div>';
        return null;
      }
      var v = Plugins.validate(obj);
      var html = '';
      if (v.errors.length) html += T('<div class="msg msg--err"><b>✕ 有 ') + v.errors.length + T(' 处错误</b><br>') + v.errors.map(esc).join('<br>') + '</div>';
      if (v.warnings.length) html += T('<div class="msg msg--warn"><b>⚠ 提示</b><br>') + v.warnings.map(esc).join('<br>') + '</div>';
      if (v.ok && !v.warnings.length) html += T('<div class="msg msg--ok">✓ 校验通过</div>');
      msgBox.innerHTML = html;
      return v.ok ? obj : null;
    }

    modal.addEventListener('click', function (e) {
      var act = e.target.getAttribute && e.target.getAttribute('data-act');
      if (act === 'm:close') return closeModal(modal);
      if (act === 'm:validate') { check(); return; }
      if (act === 'm:save') {
        var obj = check();
        if (!obj) { U.toast(T('请先修复错误'), 'error'); return; }
        var res = Plugins.install(obj, { overwrite: true });
        if (!res.ok) { U.toast(res.errors[0], 'error'); return; }
        closeModal(modal);
        refreshPluginCSS();
        U.toast(T('插件已') + (isNew ? T('安装') : T('保存')), 'ok');
        render(true);
      }
    });
  }

  // 这里是「手动编写插件」的起始 JSON。
  // 必须做成函数：写成模块顶层的数组常量的话，T() 会在**加载时**就求值，
  // 那时用户还没选语言，示例 JSON 里的字段名会被冻死在中文上。
  function samplePluginJSON() { return [
    '{',
    '  "id": "my.example",',
    T('  "name": "我的卡型",'),
    T('  "icon": "🧪",'),
    '  "version": "1.0.0",',
    '  "apiVersion": 1,',
    T('  "description": "一句话说明这个卡型是干什么的",'),
    '  "mode": "template",',
    '  "fields": [',
    T('    { "key": "q", "label": "问题", "type": "textarea", "required": true },'),
    T('    { "key": "a", "label": "答案", "type": "textarea", "required": true },'),
    T('    { "key": "tip", "label": "记忆技巧", "type": "text" }'),
    '  ],',
    '  "templates": {',
    '    "front": "<b>{{q}}</b>",',
    '    "back": "{{{a}}}{{#tip}}<div class=\\"tip\\">💡 {{tip}}</div>{{/tip}}"',
    '  },',
    '  "css": ".tip{color:#f59e0b;font-size:.9em;margin-top:.5em}",',
    '  "ai": {',
    '    "kind": "cards",',
    '    "prompt": "把下面材料拆成 {{count}} 张卡片，只输出 JSON：{\\"cards\\":[{\\"q\\":\\"\\",\\"a\\":\\"\\",\\"tip\\":\\"\\"}]}\\n\\n材料：\\n{{text}}"',
    '  }',
    '}'
  ].join('\n'); }

  /* ============================================================
   * 视图：设置
   * ============================================================ */
  /* ============================================================
   * 视图：成长
   *
   * 两条成长线在这里会合：
   *   · 角色线 —— 等级 / 称号 / 徽章 / 连续天数 / 连击 / 每日流水（数据在 Game 里）
   *   · 卡片线 —— 0-5 级掌握度 / 精通休眠 / 每张卡自己的遗忘曲线（数据挂在 card.sched 上）
   * 这个页面本身不参与调度计算，唯一的写操作是「领奖」和「唤醒这张卡」。
   * 所有 class 都以 fc-gm- 开头，配合 app.css 里的 CSS 变量，用户能在自定义 CSS 里整套改掉。
   * ============================================================ */

  /** 任务措辞。故意写成 switch 而不是模块顶层的映射表：
   *  顶层求值会把文案冻在加载时的语言上（踩过 TABS 那个坑）。 */
  function taskText(kind, n) {
    switch (kind) {
      case 'reviews':  return T('复习 {n} 张卡', { n: n });
      case 'newCards': return T('新建 {n} 张卡', { n: n });
      case 'correct':  return T('答对 {n} 张', { n: n });
      case 'cloze':    return T('新造 {n} 张挖空卡', { n: n });
      case 'xp':       return T('获得 {n} 点经验', { n: n });
      case 'decks':    return T('复习 {n} 个不同牌组', { n: n });
      case 'mastered': return T('把 {n} 张卡练到精通（5 级）', { n: n });
      case 'days':     return T('本周学习 {n} 天', { n: n });
      default:         return '';
    }
  }

  function monthLabel(m) {
    return [T('1月'), T('2月'), T('3月'), T('4月'), T('5月'), T('6月'),
      T('7月'), T('8月'), T('9月'), T('10月'), T('11月'), T('12月')][m] || '';
  }

  /** 已完成但还没领奖的挑战数量，用来在「成长」标签上点一个小红点。 */
  function claimableCount() {
    try { return Game.challenges().filter(function (c) { return c.done && !c.claimed; }).length; }
    catch (e) { return 0; }
  }

  /** 0-5 级掌握度的小圆点。 */
  function masteryPips(card) {
    var m = DB.masteryOf(card);
    var pips = '';
    for (var i = 1; i <= DB.MASTER_MAX; i++) pips += '<i class="' + (i <= m ? 'on' : '') + '"></i>';
    var label = T('掌握等级') + ' ' + m + '/' + DB.MASTER_MAX;
    if (DB.isSleeping(card)) label += ' · ' + T('已精通（休眠中）');
    return '<span class="fc-gm-pips" role="img" aria-label="' + esc(label) + '" title="' + esc(label) + '">' +
      pips + '</span>';
  }

  /** 把两次 profile() 的差量说成一句人话；没有值得一提的就返回 ''。 */
  function growthFlash(before, after) {
    var bits = [];
    var dxp = after.xp - before.xp;
    if (dxp > 0) bits.push('+' + dxp + T(' 经验'));
    if (after.level > before.level) bits.push(T('🎉 升级到 Lv.') + after.level + T('（') + T(after.title.name) + T('）'));
    var nb = after.badgesGot - before.badgesGot;
    if (nb > 0) bits.push(T('🏅 解锁 ') + nb + T(' 枚徽章'));
    return bits.join(T(' · '));
  }

  function heatmapHTML(hm) {
    var today = Game.dayKey();
    // 月份标签：把列按「这一列第一天属于哪个月」切成若干段
    var segs = [], i = 0;
    while (i < hm.cols.length) {
      var m = new Date(hm.cols[i][0].key + 'T00:00:00').getMonth();
      var j = i;
      while (j + 1 < hm.cols.length && new Date(hm.cols[j + 1][0].key + 'T00:00:00').getMonth() === m) j++;
      segs.push({ m: m, start: i, len: j - i + 1 });
      i = j + 1;
    }
    var n = hm.cols.length;
    return '<div class="fc-gm-hm">' +
      '<div class="fc-gm-hm-days" aria-hidden="true">' +
        '<span>' + esc(T('一')) + '</span><span></span><span>' + esc(T('三')) + '</span><span></span>' +
        '<span>' + esc(T('五')) + '</span><span></span><span>' + esc(T('日')) + '</span>' +
      '</div>' +
      '<div class="fc-gm-hm-body">' +
        '<div class="fc-gm-hm-months" style="grid-template-columns:repeat(' + n + ',var(--fc-hm))">' +
          segs.map(function (sg) {
            return '<span style="grid-column:' + (sg.start + 1) + ' / span ' + sg.len + '">' +
              esc(monthLabel(sg.m)) + '</span>';
          }).join('') +
        '</div>' +
        // 列 = 周，行 = 星期几，和 GitHub 一致：grid-auto-flow: column 让 7 个一列自动折行
        '<div class="fc-gm-hm-grid">' +
          hm.cols.map(function (col) {
            return col.map(function (cell) {
              var cls = 'fc-gm-hm-cell lv' + cell.level +
                (cell.key === today ? ' is-today' : '') + (cell.future ? ' is-future' : '');
              var tt = cell.key + T(' · 复习 ') + cell.reviews + T(' 次 · 新建 ') + (cell.count - cell.reviews) + T(' 张');
              return '<i class="' + cls + '" title="' + esc(tt) + '"></i>';
            }).join('');
          }).join('') +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="fc-gm-hmfoot"><span>' + T('最近 ') + hm.weeks + T(' 周 · 活跃 ') + hm.activeDays +
      T(' 天 · 共 ') + hm.total + T(' 次') + '</span>' +
      '<span class="fc-gm-legend">' + T('少') +
        [0, 1, 2, 3, 4].map(function (lv) { return '<i class="fc-gm-hm-cell lv' + lv + '"></i>'; }).join('') +
        T('多') + '</span></div>';
  }

  function taskRowHTML(t) {
    return '<div class="fc-gm-task' + (t.claimed ? ' is-claimed' : '') + (t.done ? ' is-done' : '') + '">' +
      '<span class="fc-gm-task-ico" aria-hidden="true">' + t.ico + '</span>' +
      '<div class="fc-gm-task-main">' +
        '<div class="fc-gm-task-text">' + esc(taskText(t.kind, t.target)) + '</div>' +
        '<div class="fc-gm-bar"><i style="width:' + t.pct + '%"></i></div>' +
      '</div>' +
      '<div class="fc-gm-task-tail"><span class="fc-gm-task-num">' + t.now + ' / ' + t.target + '</span>' +
        (t.claimed ? '<span class="fc-gm-task-xp is-got">✓</span>'
                   : '<span class="fc-gm-task-xp">+' + t.xp + '</span>') +
      '</div></div>';
  }

  function statCell(ico, label, big, sub) {
    return '<div class="fc-gm-stat"><span class="fc-gm-stat-ico" aria-hidden="true">' + ico + '</span>' +
      '<div class="fc-gm-stat-main"><div class="fc-gm-stat-label">' + esc(label) + '</div>' +
      '<div class="fc-gm-stat-big">' + esc(big) + '</div>' +
      '<div class="fc-gm-stat-sub">' + esc(sub) + '</div></div></div>';
  }

  function viewGrowth() {
    var p = Game.profile();
    var hm = Game.heatmap(26);
    var ch = Game.challenges();
    var badges = Game.badgeList();
    var gotBadges = badges.filter(function (b) { return b.got; }).length;
    var daily = ch.filter(function (c) { return c.scope === 'd'; });
    var weekly = ch.filter(function (c) { return c.scope === 'w'; });
    var claimable = ch.filter(function (c) { return c.done && !c.claimed; }).length;

    var h = '<div class="fc-gm">';

    /* ---- 角色面板 ---- */
    h += '<div class="card-panel fc-gm-hero">' +
      '<div class="fc-gm-avatar" aria-hidden="true">' + esc(p.title.ico) + '</div>' +
      '<div class="fc-gm-hero-main">' +
        '<div class="fc-gm-hero-top">' +
          '<b class="fc-gm-title">' + esc(T(p.title.name)) + '</b>' +
          '<span class="fc-gm-level">Lv.' + p.level + '</span>' +
        '</div>' +
        '<div class="fc-gm-xpbar" role="progressbar" aria-valuemin="0" aria-valuemax="' + p.needLevel +
          '" aria-valuenow="' + p.inLevel + '"><i style="width:' + p.pct + '%"></i></div>' +
        '<div class="fc-gm-xp-text">' + p.inLevel + ' / ' + p.needLevel + T(' 经验') +
          (p.toNext > 0 ? T(' · 还差 ') + p.toNext + T(' 点到 Lv.') + (p.level + 1) : '') + '</div>' +
        (p.nextTitle
          ? '<div class="fc-gm-next">' + T('下一个称号：') + esc(T(p.nextTitle.name)) + ' (Lv.' + p.nextTitle.min + ')</div>'
          : '<div class="fc-gm-next">' + T('已经是最高称号了') + '</div>') +
      '</div></div>';

    /* ---- 连续天数 / 连击 / 精通 / 正确率 ---- */
    h += '<div class="fc-gm-statgrid">' +
      statCell('🔥', T('连续天数'), I18n.count(p.streak.current, ' 天'),
        (p.streak.studiedToday ? T('今天已打卡') : T('今天还没学')) + T(' · 最长 ') + I18n.count(p.streak.best, ' 天')) +
      statCell('⚡', T('当前连击'), I18n.count(p.streak.combo, ' 次'),
        T('最佳 ') + I18n.count(p.streak.bestCombo, ' 次 · 断连只清连击')) +
      statCell('🏅', T('已精通'), p.masteredCount + T(' 张'),
        T('累计复习 ') + I18n.count(p.reviews, ' 次')) +
      statCell('🎯', T('正确率'), p.accuracy + '%',
        T('连击加成 +') + Math.round((p.streakBonus - 1) * 100) + '%') +
      '</div>';

    /* ---- 每日 / 每周挑战 ---- */
    h += '<div class="card-panel">' +
      '<div class="section-title">🎯 ' + esc(T('今日挑战')) + '</div>' +
      daily.map(taskRowHTML).join('') +
      '<div class="section-title" style="margin-top:16px">📅 ' + esc(T('本周挑战')) + '</div>' +
      weekly.map(taskRowHTML).join('') +
      (claimable
        ? T('<button class="btn btn--primary btn--block" style="margin-top:12px" data-act="gm:claim">领取 ') +
          claimable + T(' 个已完成的奖励</button>')
        : T('<div class="muted" style="margin-top:12px;text-align:center">完成上面的挑战，奖励会自动出现在这里</div>')) +
      '</div>';

    /* ---- 学习日历热力图 ---- */
    h += '<div class="card-panel">' +
      '<div class="section-title">📅 ' + esc(T('学习日历')) + '</div>' +
      heatmapHTML(hm) +
      '</div>';

    /* ---- 徽章 ---- */
    h += '<div class="card-panel">' +
      '<div class="section-title">🏅 ' + esc(T('徽章')) + ' ' + gotBadges + ' / ' + badges.length + '</div>' +
      '<div class="fc-gm-badges">' + badges.map(function (b) {
        return '<div class="fc-gm-badge' + (b.got ? ' is-on' : '') + '" title="' + esc(T(b.desc)) + '">' +
          '<span class="fc-gm-badge-ico" aria-hidden="true">' + (b.got ? b.ico : '🔒') + '</span>' +
          '<span class="fc-gm-badge-name">' + esc(T(b.name)) + '</span></div>';
      }).join('') + '</div></div>';

    /* ---- 成长数据 ---- */
    h += '<div class="card-panel">' +
      '<div class="section-title">💾 ' + esc(T('成长数据（JSON）')) + '</div>' +
      T('<div class="muted" style="margin-bottom:10px">等级、经验、称号、徽章、连续天数、每日学习流水、每张卡的掌握度——整个成长体系都能导出成一份 JSON。</div>') +
      '<div class="row row--wrap" style="gap:8px">' +
      T('<button class="btn btn--sm" data-act="gm:export">导出成长 JSON</button>') +
      T('<button class="btn btn--sm" data-act="gm:export-cards">含卡片掌握度</button>') +
      T('<button class="btn btn--sm" data-act="gm:import">导入成长 JSON</button>') +
      T('<button class="btn btn--sm btn--danger" data-act="gm:reset">重置成长数据</button>') +
      '</div></div>';

    h += '</div>';
    return h;
  }

  /* ---- 单张卡的遗忘曲线 ---- */
  function openCurveModal(card) {
    if (!card) return;
    var f = Game.forgetting(card);
    if (!f) return;
    var m = DB.masteryOf(card);
    var rows = [
      [T('掌握等级'), m + ' / ' + DB.MASTER_MAX],
      [T('记忆稳定度'), f.stability.toFixed(1) + T(' 天')],
      [T('当前复习间隔'), f.interval + T(' 天')],
      [T('此刻还记得的概率'), Math.round(f.retentionNow * 100) + '%'],
      [T('预计下次复习'), f.nextIn <= 0 ? T('就是现在') : f.nextIn.toFixed(1) + T(' 天后')],
      [T('累计复习次数'), f.reviews + T(' 次')]
    ];
    var body = '<div class="fc-gm-curvewrap">' + Game.curveSVG(card) + '</div>' +
      '<div class="fc-gm-curvetable">' + rows.map(function (r) {
        return '<div class="fc-gm-curverow"><span>' + esc(r[0]) + '</span><b>' + esc(r[1]) + '</b></div>';
      }).join('') + '</div>' +
      T('<div class="fc-gm-note">曲线用的是 R(t) = e^(−t/S)：S 由 SRS 自己排出的间隔反推，所以图上的预测和调度器永远一致，不会出现「图上说该复习了、调度器却说还早」。圆点是你真实的复习记录，绿=答对，红=答错。</div>') +
      (DB.isSleeping(card)
        ? T('<div class="fc-gm-note is-sleep">💤 这张卡已经精通（5 级），不再主动推给你复习。想再练一次就点下面的「唤醒」——唤醒会掉一级，需要重新靠复习赚回精通。</div>')
        : '');

    var sleeping = DB.isSleeping(card);
    var actions = T('<button class="btn btn--ghost" data-act="m:close">关闭</button>') +
      (sleeping
        ? T('<button class="btn btn--primary" data-act="card:wake" data-id="') + esc(card.id) + T('">💤 唤醒这张卡</button>')
        : '');

    var modal = openModal(esc(T('遗忘曲线')) + ' · Lv.' + m, body, actions);
    modal.addEventListener('click', function (e) {
      var act = e.target.getAttribute && e.target.getAttribute('data-act');
      if (act === 'm:close') closeModal(modal);
      if (act === 'card:wake') {
        DB.wakeCard(card.id);
        closeModal(modal);
        U.toast(T('已唤醒，这张卡重新回到复习队列'), 'ok');
        render(true);
      }
    });
  }

  /* ---- 成长数据的导出 / 导入 ---- */
  function growthExportFlow(includeCards) {
    var data = Game.exportJSON({ includeCards: !!includeCards });
    var name = 'flashcards-growth-' + new Date().toISOString().slice(0, 10) + '.json';
    U.download(name, JSON.stringify(data, null, 2));
    U.toast(T('已导出成长数据'), 'ok');
  }

  function growthImportFlow() {
    U.pickFile('.json,application/json').then(function (f) {
      if (!f) return;
      var data;
      try { data = JSON.parse(f.text); }
      catch (e) { U.toast(T('文件不是合法 JSON'), 'error'); return; }
      // 兼容：整份备份里也带着成长数据，直接丢给 Game 会因为 format 不对而报错，
      // 这里替用户把 growth 那一层剥出来。
      if (data && data.format === 'flashcards-backup' && data.growth) data = data.growth;
      U.confirmBox(T('导入成长数据'),
        T('「合并」会把两边的经验、徽章、学习流水取并集（等级只升不降），适合多台设备一起用；「替换」会清空当前成长数据。'),
        T('合并导入')).then(function (ok) {
          try {
            var r = Game.importJSON(data, ok ? 'merge' : 'replace');
            U.toast(T('导入完成：Lv.') + r.level + T(' · ') + r.cards + T(' 张卡掌握度已同步'), 'ok');
            render(true);
          } catch (e) { U.toast(T('导入失败：') + e.message, 'error'); }
        });
    });
  }

  function growthResetFlow() {
    U.confirmBox(T('重置成长数据'),
      T('等级、经验、徽章、连续天数、每日学习流水都会清空，卡片本身的复习进度不受影响。确定吗？'),
      T('确认重置')).then(function (ok) {
        if (!ok) return;
        Game._reset();
        U.toast(T('成长数据已重置'), 'ok');
        render(true);
      });
  }

  function viewSettings() {
    var s = DB.getSettings();
    var h = '';

    h += T('<div class="card-panel"><div class="section-title">🤖 AI 接口（OpenAI 兼容）</div>') +
      T('<label class="field"><span>API 地址 (Base URL)</span>') +
      '<input type="url" id="set-base" value="' + esc(s.ai.baseUrl) + '" placeholder="https://api.deepseek.com/v1"></label>' +
      '<label class="field"><span>API Key</span>' +
      // 刻意用 text 而不是 password：很多输入法/密码管理器在 WebView 里会把
      // password 框当成自动填充目标，弹一堆东西挡住视线；而且 Key 本来就明文
      // 存在 localStorage 里，遮住字符并不增加任何安全性，只让自己核对更费劲。
      '<input type="text" id="set-key" value="' + esc(s.ai.apiKey) + '" placeholder="sk-..."' +
      ' autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></label>' +
      T('<label class="field"><span>模型名</span>') +
      '<input type="text" id="set-model" value="' + esc(s.ai.model) + '" placeholder="deepseek-chat / gpt-4o-mini / qwen-plus"></label>' +
      '<label class="field"><span>Temperature</span>' +
      '<input type="number" id="set-temp" step="0.1" min="0" max="2" value="' + esc(s.ai.temperature) + '"></label>' +
      '<label class="switch" style="margin-bottom:12px"><input type="checkbox" id="set-jsonmode"' +
      (s.ai.jsonMode !== false ? ' checked' : '') + T('><span class="track"></span><span>请求 JSON 输出模式（部分服务不支持，勾掉即可）</span></label>') +
      '<div class="row row--wrap" style="gap:8px">' +
      T('<button class="btn btn--sm" data-act="set:test">🔌 测试连接</button>') +
      '<button class="btn btn--sm btn--ghost" data-act="set:preset" data-v="deepseek">DeepSeek</button>' +
      '<button class="btn btn--sm btn--ghost" data-act="set:preset" data-v="openai">OpenAI</button>' +
      T('<button class="btn btn--sm btn--ghost" data-act="set:preset" data-v="ollama">Ollama 本地</button>') +
      '<button class="btn btn--sm btn--ghost" data-act="set:preset" data-v="siliconflow">SiliconFlow</button>' +
      '</div>' +
      '<div id="set-test-msg" style="margin-top:10px"></div>' +
      T('<div class="muted" style="margin-top:8px">⚠ 在浏览器里直接打开时，请求第三方 API 属于跨源请求，') +
      T('服务端不返回 CORS 头就会报「Failed to fetch」（用 Ollama 本地跑一般没这个问题）。') +
      T('封成 APK 后走的是原生代发请求，不受同源策略限制。</div>') +
      '</div>';

    h += T('<div class="card-panel"><div class="section-title">📖 学习</div>') +
      T('<div class="row row--between" style="margin-bottom:10px"><span>每天新卡上限</span>') +
      '<input type="number" id="set-new" min="0" max="500" value="' + esc(s.study.newPerDay) + '" style="width:90px;text-align:center"></div>' +
      T('<div class="row row--between" style="margin-bottom:14px"><span>每天复习上限</span>') +
      '<input type="number" id="set-review" min="0" max="2000" value="' + esc(s.study.reviewPerDay) + '" style="width:90px;text-align:center"></div>' +
      '<label class="switch" style="margin-bottom:8px"><input type="checkbox" id="set-typing"' +
      (s.study.typing ? ' checked' : '') + T('><span class="track"></span><span>打字作答（挖空卡在空里打字，自动判分）</span></label>') +
      T('<div class="muted" style="margin:-2px 0 12px">比「心里想完再点显示答案」更接近真实回忆。判分会忽略大小写、全角半角、首尾标点；') +
      T('一个空写多个可接受答案用 <span class="mono">|</span> 隔开，例如 <span class="mono">{{c1::细胞|细胞质}}</span>。</div>') +
      T('<div class="row row--between"><span>难卡阈值（答错几次算难卡）</span>') +
      '<input type="number" id="set-leech" min="1" max="20" value="' + esc(s.study.leechThreshold) + '" style="width:90px;text-align:center"></div>' +
      '</div>';

    h += T('<div class="card-panel"><div class="section-title">🎨 外观</div>') +
      '<div class="row row--between" style="margin-bottom:10px"><span>' + T('界面语言') + '</span>' +
      '<select id="set-lang" style="width:auto;min-width:140px">' +
      I18n.LANGS.map(function (l) {
        return '<option value="' + l.id + '"' + (s.ui.lang === l.id ? ' selected' : '') + '>' + esc(l.label) + '</option>';
      }).join('') + '</select></div>' +
      '<div class="seg">' +
      [T('auto:跟随系统'), T('dark:深色'), T('light:浅色')].map(function (t) {
        var v = t.split(':')[0];
        return '<button class="' + (s.ui.theme === v ? 'on' : '') + '" data-act="set:theme" data-v="' + v + '">' + t.split(':')[1] + '</button>';
      }).join('') + '</div>' +
      T('<div class="row row--between" style="margin-top:12px"><span>正文字号</span>') +
      '<input type="number" id="set-fs" min="12" max="24" value="' + esc(s.ui.fontSize) + '" style="width:90px;text-align:center"></div>' +
      T('<div class="row row--between" style="margin-top:10px"><span>卡片最大宽度</span>') +
      '<input type="number" id="set-cw" min="320" max="1200" step="20" value="' + esc(s.ui.cardMaxWidth) + '" style="width:90px;text-align:center"></div>' +
      T('<div class="section-title" style="margin:16px 0 8px;font-size:13px">自定义 CSS</div>') +
      '<div class="muted" style="font-size:12px;line-height:1.7;margin-bottom:8px">' +
      T('在这里写的样式会作用到整个 App（不只是某张卡）。适合改配色、字号、间距。') +
      T('可用变量见 <code>app.css</code> 的 <code>:root</code>：') +
      '<code>--bg</code> <code>--bg-2</code> <code>--bg-3</code> <code>--line</code> <code>--fg</code> ' +
      '<code>--fg-2</code> <code>--primary</code> <code>--green</code> <code>--amber</code> <code>--red</code> ' +
      T('<code>--radius</code> <code>--card-w</code> <code>--fs</code>。<br>') +
      T('⚠ 浅色主题的变量定义在 <code>html[data-theme="light"]</code> 上，比 <code>:root</code> 更具体，') +
      T('所以只写 <code>:root{…}</code> 在浅色下不生效。两种主题都要改就用 ') +
      T('<code>html[data-theme]{--primary:#e11d48}</code>，浅色深色通吃。') +
      T('只想改某张卡的样式请写在插件的 <code>css</code> 字段里。</div>') +
      '<textarea id="set-css" class="code-area" rows="6" spellcheck="false" ' +
      T('autocapitalize="off" autocorrect="off" placeholder="/* 例：:root { --primary: #e11d48; } */">') +
      esc(s.ui.customCss || '') + '</textarea>' +
      '<div class="row" style="margin-top:8px;gap:8px">' +
      T('<button class="btn btn--primary btn--sm" data-act="css:apply">应用样式</button>') +
      T('<button class="btn btn--ghost btn--sm" data-act="css:clear">清空</button>') +
      '<span class="muted" style="font-size:12px">' + (s.ui.customCss ? T('已启用自定义样式') : T('当前未启用')) + '</span>' +
      '</div>' +
      '</div>';

    h += T('<div class="card-panel"><div class="section-title">💾 数据</div>') +
      '<div class="stats" style="margin-bottom:12px">' +
      '<div class="stat"><b>' + DB.listDecks().length + T('</b><span>牌组</span></div>') +
      '<div class="stat"><b>' + DB.listCards().length + T('</b><span>卡片</span></div>') +
      '<div class="stat"><b>' + DB.state.logs.length + T('</b><span>复习记录</span></div>') +
      '<div class="stat"><b>' + U.Store.keys().length + T('</b><span>存储项</span></div>') +
      '</div>' +
      '<div class="row row--wrap" style="gap:8px">' +
      T('<button class="btn btn--sm" data-act="data:export">导出备份 (.zip)</button>') +
      T('<button class="btn btn--sm" data-act="data:import">导入备份 (.zip)</button>') +
      T('<button class="btn btn--sm" data-act="data:exportText">复制备份文本</button>') +
      T('<button class="btn btn--sm" data-act="data:importText">从文本导入</button>') +
      T('<button class="btn btn--sm btn--danger" data-act="data:clear">清空所有数据</button>') +
      '</div>' +
      T('<div class="muted" style="margin-top:10px">备份是一个普通的 .zip，里面有牌组与卡片、成长数据、设置、自定义 CSS 和已安装的插件——单拎出其中任何一个文件改完再打回去也是合法备份。</div>') +
      T('<div class="muted" style="margin-top:6px">「复制备份文本」把同一个 zip 转成一段文本放进剪贴板：不用文件、不用存储权限，在微信/记事本里存好，换手机时「从文本导入」粘回来就能还原。</div>') +
      T('<div class="muted" style="margin-top:6px">数据保存在本机 localStorage，卸载 App 或清理数据会丢失，建议定期导出备份。</div>') +
      '</div>';

    // 自动快照：localStorage 一被清空就全没了，而「记得导出备份」没人做得到。
    // 这里每次启动悄悄存一份到 IndexedDB，出事了能回滚。
    h += T('<div class="card-panel"><div class="section-title">🛟 自动快照</div>') +
      T('<div id="snap-list"><div class="muted">正在读取…</div></div>') +
      '<div class="row row--wrap" style="gap:8px;margin-top:12px">' +
      T('<button class="btn btn--sm" data-act="snap:now">立即备份一份</button>') +
      T('<button class="btn btn--sm btn--ghost" data-act="snap:refresh">刷新列表</button>') +
      T('<button class="btn btn--sm btn--danger" data-act="snap:clear">清空快照</button>') +
      '</div>' +
      T('<div class="muted" style="margin-top:10px">每次启动自动存一份（同一小时内只存一次），只保留最近 10 份。') +
      T('快照放在 IndexedDB，不会占用 localStorage 的 5MB 配额。</div>') +
      '</div>';

    h += T('<div class="card-panel"><div class="section-title">📑 CSV / TSV</div>') +
      T('<div class="muted" style="margin-bottom:10px">用来和 Anki、Excel、Notion 交换数据：') +
      T('第一行是表头（字段名或字段标签），后面每行一张卡。</div>') +
      '<div class="row row--wrap" style="gap:8px">' +
      T('<button class="btn btn--sm" data-act="csv:export">导出当前牌组为 CSV</button>') +
      T('<button class="btn btn--sm" data-act="csv:import">从 CSV / TSV 导入</button>') +
      '</div>' +
      '</div>';

    h += T('<div class="card-panel"><div class="section-title">ℹ️ 关于</div>') +
      '<div class="muted" style="line-height:1.9">' +
      T('<b style="color:var(--fg)">闪卡 · FlashCards</b> v1.0.0<br>') +
      T('纯前端单页应用，无任何外部依赖，可离线使用。<br>') +
      T('调度算法：SM-2 简化版（重来 / 困难 / 良好 / 简单）。<br>') +
      T('扩展方式：编写 JSON 插件即可新增卡片类型与 AI 提示词。') +
      '</div></div>';

    return h;
  }

  /* ============================================================
   * 模态框
   * ============================================================ */
  function openModal(title, bodyHTML, actionsHTML) {
    var root = document.getElementById('modal-root');
    var back = el('div', { class: 'modal-backdrop' });
    back.innerHTML = '<div class="modal"><h3>' + title + '</h3>' +
      '<div class="m-body">' + bodyHTML + '</div>' +
      '<div class="modal-actions">' + (actionsHTML || '') + '</div></div>';
    back.addEventListener('click', function (e) { if (e.target === back) closeModal(back); });
    root.appendChild(back);
    var m = $('.modal', back);
    m._backdrop = back;
    return m;
  }
  function closeModal(m) {
    if (!m) return;
    var back = m._backdrop || m;
    if (back && back.parentNode) back.parentNode.removeChild(back);
  }

  /* ============================================================
   * 事件
   * ============================================================ */
  function closeAllModals() {
    var root = document.getElementById('modal-root');
    if (root) root.innerHTML = '';
  }

  function onClick(e) {
    var t = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!t) return;
    var act = t.getAttribute('data-act');
    var v = t.getAttribute('data-v');
    var id = t.getAttribute('data-id');

    // 顶栏 select 的点击不处理
    if (t.tagName === 'SELECT' || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;

    switch (act) {
      /* ---- 语言选择页 ---- */
      case 'lang:pick': e.preventDefault(); pickLang(v); break;

      /* ---- 导航 ---- */
      case 'nav':
        if (App.route === 'study' && App.study.idx > 0 && App.study.idx < App.study.queue.length) {
          // 允许直接离开
        }
        App.route = v;
        if (v !== 'cards') App.openDeck = '';
        render();
        break;

      /* ---- 牌组 ---- */
      case 'deck:new': e.preventDefault(); createDeckFlow(); break;
      case 'deck:select': break;
      case 'deck:open':
        App.openDeck = id; App.search = ''; App.route = 'cards'; render();
        break;
      case 'deck:back': App.openDeck = ''; App.search = ''; render(); break;
      case 'deck:edit': editDeckFlow(id); break;
      case 'deck:del': deleteDeckFlow(id); break;
      case 'deck:export': exportDeckFlow(id); break;
      case 'deck:addCard': openCardEditor(null, App.deckId); break;
      case 'deck:ai': aiGenerateFlow(id); break;
      case 'deck:bulk': bulkImportFlow(id); break;

      /* ---- 学习 ---- */
      case 'study:reveal':
        if (!App.study.revealed) {
          if (t.classList.contains('flip-card') &&
            e.target.closest('[data-act="card:edit"], [data-act="card:del"], [data-act="card:suspend"], .cloze-input')) break;
          App.study.revealed = true;
          // 「想不起来直接看答案」：清掉打字结果，别在正面上留半截输入
          App.study.typed = null;
          render();
        }
        break;
      case 'study:check': checkTyping(); break;
      case 'study:undo': undoRating(); break;
      case 'study:rate': rateCard(parseInt(t.getAttribute('data-r'), 10)); break;
      case 'study:reload': startStudy(); render(true); U.toast(T('队列已刷新')); break;
      case 'card:split': e.stopPropagation(); splitCardFlow(id); break;

      /* ---- 卡片 ---- */
      case 'card:new': e.stopPropagation(); openCardEditor(null, t.getAttribute('data-deck')); break;
      case 'card:edit': e.stopPropagation(); openCardEditor(DB.getCard(id)); break;
      case 'card:del':
        e.stopPropagation();
        U.confirmBox(T('删除卡片'), T('确定删除这张卡片？'), T('删除')).then(function (ok) {
          if (!ok) return;
          DB.deleteCard(id);
          var q = App.study.queue;
          var i = q.findIndex(function (c) { return c.id === id; });
          if (i >= 0) { q.splice(i, 1); if (App.study.idx > i) App.study.idx--; if (App.study.idx >= q.length) App.study.idx = Math.max(0, q.length - 1); }
          U.toast(T('已删除'), 'ok');
          render(true);
        });
        break;
      case 'card:suspend':
        e.stopPropagation();
        var cc = DB.getCard(id);
        if (cc) {
          DB.updateCard(id, { suspended: !cc.suspended });
          App.study.queue = App.study.queue.filter(function (c) { return c.id !== id; });
          if (App.study.idx >= App.study.queue.length) { startStudy(); }
          U.toast(cc.suspended ? T('已恢复') : T('已暂停'), 'ok');
          render(true);
        }
        break;

      /* ---- 挖空 ---- */
      case 'cz:mode':
        czSync();
        App.cz.tapMode = v === 'tap';
        render(true);
        break;
      case 'cz:target': break;
      case 'cz:engine': App.cz.aiEngine = v; render(true); break;
      case 'cz:wrap': e.preventDefault(); czWrapSelection(); break;
      case 'cz:unwrap': e.preventDefault(); czUnwrapSelection(); break;
      case 'cz:clear':
        App.cz.markup = '';
        var ta0 = document.getElementById('cz-src');
        if (ta0) ta0.value = '';
        czUpdatePreview();
        break;
      case 'cz:auto': czSmart(); break;
      case 'cz:gencards': czGenerateCards(); break;
      case 'cz:word':
        e.preventDefault();
        czSync();
        var s = parseInt(t.getAttribute('data-s'), 10);
        var en = parseInt(t.getAttribute('data-e'), 10);
        var r = Cloze.toggle(App.cz.markup, s, en, {});
        App.cz.markup = r.markup;
        var ta1 = document.getElementById('cz-src');
        if (ta1) ta1.value = r.markup;
        czUpdatePreview();
        break;
      case 'cz:save':
        saveCloze();
        break;

      /* ---- 插件 ---- */
      case 'pl:install': installFromPaste(); break;
      case 'pl:fromFile': installFromFile(); break;
      case 'pl:examples-toggle': toggleExamples(); break;
      case 'pl:example-install': installExample(t.getAttribute('data-file')); break;
      case 'pl:new': openPluginEditor(null); break;
      case 'pl:edit': openPluginEditor(Plugins.get(id)); break;
      case 'pl:fromUrl': installFromUrl(); break;
      case 'pl:export':
        U.download(id.replace(/[^\w.-]/g, '_') + '.plugin.json', Plugins.exportPlugin(id));
        break;
      case 'pl:toggle':
        Plugins.setEnabled(id, t.getAttribute('data-on') === '1');
        refreshPluginCSS();
        render();
        break;
      case 'pl:del':
        if (Plugins.isBuiltin(id)) {
          Plugins.uninstall(id);
          refreshPluginCSS();
          render();
          U.toast(T('内置插件已停用'), 'ok');
          break;
        }
        U.confirmBox(T('删除插件'), T('删除后该卡型的新建/编辑将不可用（已有卡片数据仍保留）。确定？'), T('删除')).then(function (ok) {
          if (!ok) return;
          Plugins.uninstall(id);
          refreshPluginCSS();
          render();
          U.toast(T('已删除'), 'ok');
        });
        break;
      case 'pl:preview': App.pl.previewId = App.pl.previewId === id ? '' : id; render(true); break;
      case 'pl:preview-close': App.pl.previewId = ''; render(true); break;
      case 'pl:doc': e.preventDefault(); showPluginDoc(); break;

      /* ---- 设置 ---- */
      case 'set:theme':
        DB.saveSettings({ ui: { theme: v } });
        applyTheme(); render(true);
        break;
      case 'set:test': testAIConnection(); break;
      case 'set:preset': applyPreset(v); break;
      case 'css:apply':
        U.toast(saveUserCss() ? T('自定义样式已应用') : T('已清空自定义样式'), 'ok');
        break;
      case 'css:clear':
        saveUserCss('');
        U.toast(T('已清空自定义样式'), 'ok');
        break;

      /* ---- 数据 ---- */
      case 'data:export': exportBundleFlow(); break;
      case 'data:import': importBackupFlow(); break;
      case 'data:exportText': exportTextFlow(); break;
      case 'data:importText': importTextFlow(); break;
      case 'csv:export': csvExportFlow(); break;
      case 'csv:import': csvImportFlow(); break;

      /* ---- 自动快照 ---- */
      case 'snap:now':
        DB.snapshotSave(T('手动备份'), true).then(function (sid) {
          U.toast(sid ? T('已备份一份快照') : T('这台设备不支持本地快照'), sid ? 'ok' : 'error');
          renderSnapList();
        });
        break;
      case 'snap:refresh': renderSnapList(); U.toast(T('已刷新')); break;
      case 'snap:restore': snapRestoreFlow(id); break;
      case 'snap:clear':
        U.confirmBox(T('清空快照'), T('会删掉全部自动快照，之后就没法回滚了。确定吗？'), T('清空')).then(function (ok) {
          if (!ok) return;
          DB.snapshotClear().then(function () { renderSnapList(); U.toast(T('快照已清空'), 'ok'); });
        });
        break;
      case 'data:clear':
        U.confirmBox(T('清空所有数据'), T('所有牌组、卡片、复习记录都会被删除，且不可恢复！建议先导出备份。'), T('确认清空')).then(function (ok) {
          if (!ok) return;
          U.confirmBox(T('最后确认'), T('真的要清空吗？此操作不可撤销。'), T('清空')).then(function (ok2) {
            if (!ok2) return;
            DB.clearAll();
            App.study.queue = []; App.openDeck = '';
            render();
            U.toast(T('已清空'), 'ok');
          });
        });
        break;

      /* ---- 成长 ---- */
      case 'gm:claim': {
        var cl = Game.claimTasks();
        if (cl.xp > 0) {
          U.toast(T('领到 {n} 点经验（{m} 个任务）', {n: cl.xp, m: cl.count}), 'ok');
          render(true);
        } else {
          U.toast(T('还没有可以领取的奖励'));
        }
        break;
      }
      case 'gm:export': growthExportFlow(false); break;
      case 'gm:export-cards': growthExportFlow(true); break;
      case 'gm:import': growthImportFlow(); break;
      case 'gm:reset': growthResetFlow(); break;
      case 'card:curve':
        e.stopPropagation();
        openCurveModal(DB.getCard(id));
        break;
      // card:wake / m:close 不在这里处理：它们只出现在模态框内部，
      // 模态框自己已经绑了 click（见 openCurveModal / openModal）。
      // 这里再来一次会让 wakeCard 跑两遍——一次掉一级，两遍掉两级。
    }
  }

  /* ---- 快照列表 ---- */
  function renderSnapList() {
    var host = document.getElementById('snap-list');
    if (!host) return;
    if (!DB.snapshotSupported()) {
      host.innerHTML = T('<div class="msg msg--warn">这台设备的 WebView 不支持 IndexedDB，自动快照不可用。') +
        T('请用「导出全部备份」手动保存。</div>');
      return;
    }
    DB.snapshotList().then(function (list) {
      if (!list.length) {
        host.innerHTML = T('<div class="muted">还没有快照。每次启动会自动存一份。</div>');
        return;
      }
      host.innerHTML = list.map(function (s, i) {
        return '<div class="snap-row">' +
          '<div><b>' + esc(U.fmtTime(s.t)) + '</b>' +
          '<span class="muted"> · ' + esc(s.reason || '') + ' · ' +
          (s.counts.decks || 0) + T(' 牌组 / ') + (s.counts.cards || 0) + T(' 卡片</span></div>') +
          '<button class="btn btn--sm" data-act="snap:restore" data-id="' + esc(s.id) + '">' +
          (i === 0 ? T('恢复到这份') : T('恢复')) + '</button>' +
          '</div>';
      }).join('');
    });
  }

  function snapRestoreFlow(id) {
    U.confirmBox(T('恢复快照'), T('会用这份快照整体覆盖当前的所有牌组和卡片，当前数据将被替换。确定吗？'), T('恢复')).then(function (ok) {
      if (!ok) return;
      // 覆盖前先给「当前状态」留一份，恢复错了还能再救回来
      DB.snapshotSave(T('恢复前自动备份'), true).then(function () {
        return DB.snapshotRestore(id);
      }).then(function (r) {
        App.study.queue = []; App.openDeck = ''; App.search = '';
        startStudy();
        U.toast(T('已恢复到 ') + U.fmtTime(r.t), 'ok');
        render(true);
      }).catch(function (err) {
        U.toast(T('恢复失败：') + (err && err.message ? err.message : err), 'error');
      });
    });
  }

  /* ============================================================
   * CSV / TSV 导入导出
   * ============================================================ */
  function csvExportFlow() {
    var d = currentDeck();
    if (!d) { U.toast(T('先选一个牌组')); return; }
    var p = Plugins.get(d.pluginId);
    var keys = (p.fields || []).map(function (f) { return f.key; });
    var rows = [keys.concat(['tags'])];
    DB.listCards(d.id).forEach(function (c) {
      rows.push(keys.map(function (k) {
        var v = c.fields[k];
        if (Array.isArray(v)) v = v.join('; ');
        return v === undefined || v === null ? '' : String(v);
      }).concat([(c.tags || []).join(' ')]));
    });
    U.download(d.name + '.csv', U.toDSV(rows, ','), 'text/csv');
    U.toast(T('已导出 {n} 张卡的 CSV', {n: (rows.length - 1)}), 'ok');
  }

  function csvImportFlow() {
    var list = decks();
    if (!list.length) { U.toast(T('先建一个牌组')); return; }
    var body =
      T('<div class="msg msg--warn">支持 CSV / TSV（分隔符自动识别，也能手动选）。') +
      T('首行是表头，用字段 key 或字段标签都能对上。</div>') +
      T('<label class="field"><span>目标牌组</span><select id="csv-deck">') +
      list.map(function (d) {
        return '<option value="' + esc(d.id) + '">' + esc(d.name) + T('　(') + esc(Plugins.get(d.pluginId).name) + ')</option>';
      }).join('') + '</select></label>' +
      T('<label class="field"><span>粘贴 CSV / TSV 内容</span>') +
      T('<textarea id="csv-text" style="min-height:140px" placeholder="front,back&#10;问题,答案"></textarea></label>') +
      T('<div class="row row--wrap" style="gap:8px"><button class="btn btn--sm" data-act="m:pick">📂 选择文件</button>') +
      '<span class="muted" id="csv-file"></span></div>' +
      '<div id="csv-msg" style="margin-top:12px"></div>';
    var modal = openModal(T('从 CSV / TSV 导入'), body,
      T('<button class="btn btn--ghost" data-act="m:close">取消</button>') +
      T('<button class="btn btn--primary" data-act="m:go">导入</button>'));

    function showPreview() {
      var text = $('#csv-text', modal).value;
      var host = $('#csv-msg', modal);
      if (!text.trim()) { host.innerHTML = ''; return; }
      var parsed = U.parseDSV(text);
      var d = DB.getDeck($('#csv-deck', modal).value);
      var p = Plugins.get(d.pluginId);
      var header = parsed.rows[0] || [];
      var mapping = header.map(function (h) { return matchField(p, h); });
      var okCols = mapping.filter(Boolean);
      var body2 = parsed.rows.slice(1, 4).map(function (r) {
        return '<div class="muted mono" style="font-size:12px">' + esc(r.join(' | ')) + '</div>';
      }).join('');
      host.innerHTML = '<div class="msg ' + (okCols.length ? 'msg--ok' : 'msg--err') + '">' +
        T('分隔符「{n}」，共 ', {n: (parsed.delim === '\t' ? 'Tab' : parsed.delim)}) + Math.max(0, parsed.rows.length - 1) + T(' 行数据。<br>') +
        T('列映射：') + header.map(function (h, i) {
          return esc(h) + T('→') + (mapping[i] ? esc(mapping[i]) : T('<b>忽略</b>'));
        }).join(T('、')) + '</div>' + body2;
      return { parsed: parsed, mapping: mapping };
    }

    modal.addEventListener('click', function (e) {
      var act = e.target.getAttribute && e.target.getAttribute('data-act');
      if (act === 'm:close') return closeModal(modal);
      if (act === 'm:pick') {
        U.pickFile('.csv,.tsv,.txt,text/*').then(function (f) {
          if (!f) return;
          $('#csv-text', modal).value = f.text;
          $('#csv-file', modal).textContent = f.name;
          showPreview();
        });
        return;
      }
      if (act !== 'm:go') return;
      var res = showPreview();
      if (!res) { U.toast(T('请先粘贴内容'), 'error'); return; }
      var d = DB.getDeck($('#csv-deck', modal).value);
      var p = Plugins.get(d.pluginId);
      var bulk = [];
      res.parsed.rows.slice(1).forEach(function (r) {
        var fields = {};
        res.mapping.forEach(function (key, i) {
          if (key) fields[key] = r[i] === undefined ? '' : r[i];
        });
        if (!Object.keys(fields).some(function (k) { return String(fields[k]).trim(); })) return;
        var tags = [];
        var tagIdx = res.mapping.indexOf('__tags');
        if (tagIdx >= 0) tags = String(r[tagIdx] || '').split(/[\s,，、;]+/).filter(Boolean);
        bulk.push({ deckId: d.id, pluginId: p.id, fields: fields, tags: tags });
      });
      if (!bulk.length) { U.toast(T('没有解析出任何有效行'), 'error'); return; }
      DB.createCardsBulk(bulk);
      closeModal(modal);
      U.toast(T('导入 {n} 张卡片', {n: bulk.length}), 'ok');
      render(true);
    });
  }

  /* 把 CSV 表头对上插件的字段：先按 key，再按 label / 名称模糊匹配 */
  function matchField(plugin, header) {
    var h = String(header || '').trim();
    if (!h) return null;
    if (h.toLowerCase() === 'tags' || h === T('标签')) return '__tags';
    var fields = plugin.fields || [];
    for (var i = 0; i < fields.length; i++) if (fields[i].key === h) return fields[i].key;
    for (var j = 0; j < fields.length; j++) {
      var f = fields[j];
      if ((f.label || '') === h || (f.label || '').toLowerCase() === h.toLowerCase()) return f.key;
    }
    return null;
  }

  function onChange(e) {
    var t = e.target;
    var act = t.getAttribute && t.getAttribute('data-act');
    if (act === 'deck:select') { setDeck(t.value); startStudy(); render(); return; }
    if (act === 'cz:target') { App.cz.targetDeck = t.value; return; }

    switch (t.id) {
      case 'cz-count': App.cz.count = U.clamp(parseInt(t.value, 10) || 3, 1, 30); break;
      case 'cz-one': App.cz.oneCardPerBlank = t.checked; break;
      case 'pl-overwrite': App.pl.overwrite = t.checked; break;
      case 'set-jsonmode': DB.saveSettings({ ai: { jsonMode: t.checked } }); break;
      case 'set-base': DB.saveSettings({ ai: { baseUrl: t.value } }); break;
      case 'set-key': DB.saveSettings({ ai: { apiKey: t.value } }); break;
      case 'set-model': DB.saveSettings({ ai: { model: t.value } }); break;
      case 'set-temp': DB.saveSettings({ ai: { temperature: U.parseNum(t.value, 0.3) } }); break;
      case 'set-new': DB.saveSettings({ study: { newPerDay: parseInt(t.value, 10) || 0 } }); break;
      case 'set-review': DB.saveSettings({ study: { reviewPerDay: parseInt(t.value, 10) || 0 } }); break;
      case 'set-typing':
        DB.saveSettings({ study: { typing: t.checked } });
        App.study.typed = null;
        // 开关一变，正面的渲染方式整个不一样；重开一轮省得中途半新半旧
        U.toast(t.checked ? T('打字作答已开启：挖空卡要自己打出来') : T('已关闭打字作答'));
        break;
      case 'set-leech': DB.saveSettings({ study: { leechThreshold: U.clamp(parseInt(t.value, 10) || 4, 1, 20) } }); break;
      case 'set-fs': DB.saveSettings({ ui: { fontSize: U.clamp(parseInt(t.value, 10) || 16, 12, 24) } }); applyTheme(); break;
      case 'set-lang':
        // 词典换了，整页文字都要重画。render(true) 保住滚动位置。
        DB.saveSettings({ ui: { lang: I18n.normalize(t.value) || I18n.DEFAULT_LANG } });
        I18n.setLang(t.value);
        render(true);
        break;
      case 'set-cw': DB.saveSettings({ ui: { cardMaxWidth: U.clamp(parseInt(t.value, 10) || 720, 320, 1200) } }); applyTheme(); break;
    }
  }

  var searchTimer = null;
  function onInput(e) {
    var t = e.target;
    if (t.id === 'cz-src') { App.cz.markup = t.value; return; }
    if (t.id === 'cz-extra') { App.cz.extra = t.value; return; }
    if (t.id === 'card-search') {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        var pos = t.selectionStart;
        App.search = t.value;
        render(true);
        var nt = document.getElementById('card-search');
        if (nt) { nt.focus(); try { nt.setSelectionRange(pos, pos); } catch (er) { } }
      }, 260);
    }
    if (t.id === 'set-base' || t.id === 'set-key' || t.id === 'set-model' || t.id === 'set-temp') {
      var patch = {};
      if (t.id === 'set-base') patch.baseUrl = t.value;
      if (t.id === 'set-key') patch.apiKey = t.value;
      if (t.id === 'set-model') patch.model = t.value;
      if (t.id === 'set-temp') patch.temperature = U.parseNum(t.value, 0.3);
      DB.saveSettings({ ai: patch });
    }
    if (t.id === 'cz-count') App.cz.count = U.clamp(parseInt(t.value, 10) || 3, 1, 30);
  }

  function onKeyDown(e) {
    // 输入框内不接管
    var tag = (e.target.tagName || '').toLowerCase();
    var inField = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
    var key = e.key || '';
    var mod = e.ctrlKey || e.metaKey;

    if (mod && key.toLowerCase() === 'k' && App.route === 'cloze') {
      e.preventDefault(); czWrapSelection(); return;
    }
    // 撤销上一次评分：Ctrl+Z 之外也给一个裸 z（手机外接键盘/桌面都顺手）
    if (App.route === 'study' && ((mod && key.toLowerCase() === 'z') || (!inField && key.toLowerCase() === 'z'))) {
      e.preventDefault(); undoRating(); return;
    }

    // 打字作答时焦点在空里的输入框上：回车=检查，Tab 跳下一个空，其余按键正常输入
    if (inField && App.route === 'study' && e.target.classList && e.target.classList.contains('cloze-input')) {
      if (key === 'Enter') { e.preventDefault(); checkTyping(); return; }
      if (key === 'Tab') {
        var inputs = U.$$('.cloze-input');
        var i = inputs.indexOf(e.target);
        var next = inputs[e.ctrlKey || e.shiftKey ? i - 1 : i + 1];
        if (next) { e.preventDefault(); next.focus(); }
        return;
      }
      return;
    }

    // 「div 当按钮」的键盘激活：bindView 给它们加了 role=button + tabindex，
    // 但 div 不像真按钮那样自带回车/空格激活，这里补上。
    if (!inField && (key === 'Enter' || key === ' ' || key === 'Spacebar')) {
      var btn = e.target.closest ? e.target.closest('[role="button"][data-act]') : null;
      if (btn) { e.preventDefault(); onClick(e); return; }
    }

    if (inField) return;
    if (App.route !== 'study') return;

    var card = App.study.queue[App.study.idx];
    if (key === ' ' || key === 'Enter') {
      e.preventDefault();
      if (!App.study.revealed) {
        App.study.revealed = true;
        App.study.typed = null;
        render();
      }
      return;
    }
    if (App.study.revealed && ['1', '2', '3', '4'].indexOf(key) >= 0) {
      e.preventDefault();
      rateCard(parseInt(key, 10) - 1);
    }
    if (key === 'e' && card) {
      e.preventDefault();
      openCardEditor(DB.getCard(card.id));
    }
  }

  /* ============================================================
   * 业务流程
   * ============================================================ */
  function createDeckFlow() {
    return U.promptBox(T('新建牌组'), [
      { key: 'name', label: T('牌组名称'), value: '', placeholder: T('例如：考研英语核心词') },
      {
        key: 'pluginId', label: T('卡片类型'), type: 'select', value: 'builtin.cloze',
        options: Plugins.enabledList().map(function (p) { return { value: p.id, label: p.icon + ' ' + p.name }; })
      },
      { key: 'desc', label: T('说明'), placeholder: T('选填') }
    ]).then(function (r) {
      if (!r || !r.name.trim()) return null;
      var d = DB.createDeck({ name: r.name.trim(), pluginId: r.pluginId, desc: r.desc });
      setDeck(d.id);
      U.toast(T('已创建「{n}」', {n: d.name}), 'ok');
      render(true);
      return d;
    });
  }

  function editDeckFlow(id) {
    var d = DB.getDeck(id);
    if (!d) return;
    U.promptBox(T('牌组设置'), [
      { key: 'name', label: T('名称'), value: d.name },
      {
        key: 'pluginId', label: T('卡片类型'), type: 'select', value: d.pluginId,
        options: Plugins.enabledList().map(function (p) { return { value: p.id, label: p.icon + ' ' + p.name }; })
      },
      { key: 'desc', label: T('说明'), value: d.desc, placeholder: T('选填') }
    ]).then(function (r) {
      if (!r) return;
      var changedPlugin = r.pluginId !== d.pluginId;
      DB.updateDeck(id, { name: r.name.trim() || d.name, pluginId: r.pluginId, desc: r.desc });
      U.toast(changedPlugin ? T('卡型已切换（老卡仍按原卡型渲染）') : T('已保存'), 'ok');
      render(true);
    });
  }

  function deleteDeckFlow(id) {
    var d = DB.getDeck(id);
    if (!d) return;
    var n = DB.listCards(id).length;
    U.confirmBox(T('删除牌组'), T('「{n}」及其 ', {n: d.name}) + n + T(' 张卡片会被永久删除。确定吗？'), T('删除')).then(function (ok) {
      if (!ok) return;
      DB.deleteDeck(id, true);
      if (App.deckId === id) setDeck('');
      if (App.openDeck === id) App.openDeck = '';
      startStudy();
      U.toast(T('已删除'), 'ok');
      render();
    });
  }

  function exportDeckFlow(id) {
    var d = DB.getDeck(id);
    if (!d) return;
    U.download(d.name.replace(/[\\/:*?"<>|]/g, '_') + '.deck.json', JSON.stringify(DB.exportDeck(id), null, 2));
    U.toast(T('已导出牌组'), 'ok');
  }

  function bulkImportFlow(deckId) {
    var deck = DB.getDeck(deckId);
    var p = Plugins.get(deck.pluginId);
    var hint = p.mode === 'cloze'
      ? T('直接粘贴带 {{c1::答案}} 标记的文本，每段一张卡（空行分隔）。')
      : T('格式：空行分隔每张卡；卡内第一行 =「{n}」，其余行 =「', {n: p.fields[0].label}) + (p.fields[1] ? p.fields[1].label : T('背面')) + T('」。');
    var body = '<div class="msg msg--warn">' + esc(hint) + '</div>' +
      T('<textarea id="bulk-text" class="code-area" style="min-height:220px" placeholder="粘贴内容…"></textarea>');
    var modal = openModal(T('批量导入 · ') + esc(deck.name), body,
      T('<button class="btn btn--ghost" data-act="m:close">取消</button>') +
      T('<button class="btn btn--primary" data-act="m:go">导入</button>'));

    modal.addEventListener('click', function (e) {
      var act = e.target.getAttribute && e.target.getAttribute('data-act');
      if (act === 'm:close') return closeModal(modal);
      if (act !== 'm:go') return;
      var text = $('#bulk-text', modal).value;
      if (!text.trim()) { U.toast(T('内容为空'), 'error'); return; }
      var blocks = text.split(/\n\s*\n/).map(function (b) { return b.trim(); }).filter(Boolean);
      var made = 0;
      if (p.mode === 'cloze') {
        blocks.forEach(function (b) {
          if (!Cloze.hasCloze(b)) return;
          var f = Plugins.defaultFields(p);
          f[Plugins.clozeFieldKey(p)] = b;
          var defs = Cloze.toCards(b, { oneCardPerBlank: DB.getSettings().cloze.oneCardPerBlank !== false });
          DB.createCardsBulk(defs.map(function (d) { return { deckId: deckId, pluginId: p.id, fields: f, clozeIndex: d.clozeIndex }; }));
          made += defs.length;
        });
      } else {
        blocks.forEach(function (b) {
          var lines = b.split('\n');
          var f = Plugins.defaultFields(p);
          f[p.fields[0].key] = lines[0] || '';
          if (p.fields[1]) f[p.fields[1].key] = lines.slice(1).join('\n');
          DB.createCard(deckId, p.id, f, []);
          made++;
        });
      }
      closeModal(modal);
      U.toast(T('导入 {n} 张卡片', {n: made}), 'ok');
      render(true);
    });
  }

  function aiGenerateFlow(deckId) {
    var deck = DB.getDeck(deckId);
    var p = Plugins.get(deck.pluginId);
    var body =
      T('<div class="msg msg--warn">卡型：') + p.icon + ' ' + esc(p.name) + T('　提示词可在插件页自定义。</div>') +
      T('<label class="field"><span>材料</span><textarea id="ai-gen-text" style="min-height:160px" placeholder="粘贴文章 / 笔记 / 教材段落…"></textarea></label>') +
      T('<div class="row row--between"><span class="muted">卡片数量</span>') +
      '<input type="number" id="ai-gen-count" value="5" min="1" max="50" style="width:80px;text-align:center"></div>' +
      T('<div class="row row--between" style="margin-top:10px"><span class="muted">引擎</span>') +
      T('<select id="ai-gen-engine" style="width:140px"><option value="ai">🤖 AI</option><option value="local">⚡ 本地规则</option></select></div>') +
      '<div id="ai-gen-msg" style="margin-top:10px"></div>';
    var modal = openModal(T('AI 生成卡片 · ') + esc(deck.name), body,
      T('<button class="btn btn--ghost" data-act="m:close">取消</button>') +
      T('<button class="btn btn--primary" data-act="m:go">生成</button>'));

    modal.addEventListener('click', function (e) {
      var act = e.target.getAttribute && e.target.getAttribute('data-act');
      if (act === 'm:close') return closeModal(modal);
      if (act !== 'm:go') return;
      var text = $('#ai-gen-text', modal).value;
      if (!text.trim()) { U.toast(T('请粘贴材料'), 'error'); return; }
      var count = parseInt($('#ai-gen-count', modal).value, 10) || 5;
      var engine = $('#ai-gen-engine', modal).value;
      var msg = $('#ai-gen-msg', modal);
      msg.innerHTML = T('<div class="msg msg--warn"><span class="spin"></span> 生成中，请稍候…</div>');

      AI.generate(text, { count: count, pluginId: p.id, kind: Plugins.aiKind(p), engine: engine })
        .then(function (res) {
          if (!res.ok) {
            msg.innerHTML = '<div class="msg msg--err">' + esc(res.error) + (res.detail ? '<br><span class="mono">' + esc(res.detail) + '</span>' : '') + '</div>';
            return;
          }
          var n = 0;
          if (res.markup) {
            var f = Plugins.defaultFields(p);
            f[Plugins.clozeFieldKey(p)] = res.markup;
            var defs = Cloze.toCards(res.markup, { oneCardPerBlank: DB.getSettings().cloze.oneCardPerBlank !== false });
            DB.createCardsBulk(defs.map(function (d) { return { deckId: deckId, pluginId: p.id, fields: f, clozeIndex: d.clozeIndex }; }));
            n = defs.length;
          } else {
            (res.cards || []).forEach(function (fields) { DB.createCard(deckId, p.id, fields, []); n++; });
          }
          closeModal(modal);
          U.toast(T('生成 {n} 张卡片', {n: n}) + (res.fallback ? T('（本地兜底）') : ''), res.fallback ? 'error' : 'ok');
          render(true);
        });
    });
  }

  /* ============================================================
   * AI 拆卡：把「难卡」拆成一堆能背得住的小卡
   *   一张卡被反复答错，几乎总是卡本身的问题（一张卡问了三件事），
   *   所以做法是拆开它，并把原卡挂起，而不是逼着用户继续刷。
   * ============================================================ */
  function splitCardFlow(cardId) {
    var card = DB.getCard(cardId);
    if (!card) return;
    var plugin = Plugins.get(card.pluginId);
    var body =
      T('<div class="msg msg--warn">这张卡已经答错 <b>') + (card.sched.lapses || 0) + T('</b> 次。') +
      T('让 AI 把它拆成几张「一张只考一件事」的小卡。</div>') +
      '<div class="card-face' + pluginScope(card.pluginId) + '" style="margin:12px 0;padding:12px;background:var(--bg-2);border-radius:10px">' +
      Plugins.renderSide(plugin, card, 'front') + '</div>' +
      T('<div class="row row--between" style="margin-top:6px"><span class="muted">原卡怎么处理</span>') +
      '<select id="sp-keep" style="width:190px">' +
      T('<option value="suspend">挂起原卡（推荐）</option>') +
      T('<option value="keep">保留原卡继续复习</option>') +
      T('<option value="delete">拆完删掉原卡</option>') +
      '</select></div>' +
      '<div id="sp-msg" style="margin-top:12px"></div>' +
      '<div id="sp-result"></div>';
    var modal = openModal(T('✂️ AI 拆卡'), body,
      T('<button class="btn btn--ghost" data-act="m:close">取消</button>') +
      T('<button class="btn btn--primary" data-act="m:go">开始拆</button>'));

    var created = [];

    function renderPreview(list) {
      var host = $('#sp-result', modal);
      if (!list.length) {
        host.innerHTML = T('<div class="msg msg--warn">AI 认为这张卡已经足够简单，没有可拆的。</div>');
        return;
      }
      host.innerHTML = T('<div class="muted" style="margin:10px 0 6px">拆出 ') + list.length + T(' 张（可编辑后再导入）：</div>') +
        list.map(function (f, i) {
          return '<div style="margin-bottom:10px"><div class="muted">#' + (i + 1) + '</div>' +
            (plugin.fields || []).map(function (fd) {
              return '<label class="field"><span>' + esc(fd.label || fd.key) + '</span>' +
                '<textarea data-sp-field="' + i + ':' + esc(fd.key) + '" style="min-height:52px">' +
                esc(f[fd.key] || '') + '</textarea></label>';
            }).join('') + '</div>';
        }).join('');
    }

    modal.addEventListener('click', function (e) {
      var act = e.target.getAttribute && e.target.getAttribute('data-act');
      if (act === 'm:close') return closeModal(modal);
      if (act !== 'm:go') return;

      // 第二次点就是「确认导入」——预览里的修改直接读回来
      if (created.length) {
        // 先把预览里改过的内容一次性读回，避免边读边写
        U.$$('[data-sp-field]', modal).forEach(function (ta) {
          var parts = ta.getAttribute('data-sp-field').split(':');
          var f = created[parseInt(parts[0], 10)];
          if (f) f[parts[1]] = ta.value;
        });
        var bulk = [];
        var key = plugin.mode === 'cloze' ? Plugins.clozeFieldKey(plugin) : null;
        created.forEach(function (fields) {
          if (!Object.keys(fields).some(function (k) { return String(fields[k]).trim(); })) return;
          if (key) {
            Cloze.toCards(fields[key] || '', {
              oneCardPerBlank: DB.getSettings().cloze.oneCardPerBlank !== false
            }).forEach(function (d) {
              var f2 = Object.assign({}, fields);
              f2[key] = d.markup;
              bulk.push({ deckId: card.deckId, pluginId: plugin.id, fields: f2, tags: card.tags || [], clozeIndex: d.clozeIndex });
            });
          } else {
            bulk.push({ deckId: card.deckId, pluginId: plugin.id, fields: fields, tags: card.tags || [] });
          }
        });
        if (bulk.length) DB.createCardsBulk(bulk);
        var mode = $('#sp-keep', modal).value;
        if (mode === 'suspend') DB.updateCard(card.id, { suspended: true });
        if (mode === 'delete') DB.deleteCard(card.id);
        App.study.queue = App.study.queue.filter(function (c) { return c.id !== card.id; });
        if (App.study.idx >= App.study.queue.length) startStudy();
        closeModal(modal);
        U.toast(T('拆出 {n} 张卡片', {n: bulk.length}), 'ok');
        render(true);
        return;
      }

      var msg = $('#sp-msg', modal);
      msg.innerHTML = T('<div class="msg msg--warn"><span class="spin"></span> 让 AI 拆卡中，请稍候…</div>');
      AI.aiSplitCard(plugin, card.fields).then(function (res) {
        if (!res.ok) {
          msg.innerHTML = '<div class="msg msg--err">' + esc(res.error) +
            (res.detail ? '<br><span class="mono">' + esc(res.detail) + '</span>' : '') +
            T('<br>可以在设置页检查 AI 配置，或先用「编辑」手动拆。</div>');
          return;
        }
        msg.innerHTML = '';
        created = res.cards;
        renderPreview(created);
        if (created.length) {
          var goBtn = $('.modal-actions [data-act="m:go"]', modal);
          if (goBtn) goBtn.textContent = T('导入这 {n} 张', {n: created.length});
        }
      });
    });
  }

  function saveCloze() {
    czSync();
    var markup = App.cz.markup;
    if (!Cloze.hasCloze(markup)) { U.toast(T('还没有挖空，先挖几个空吧'), 'error'); return; }
    var deckId = App.cz.targetDeck;
    var deck = DB.getDeck(deckId);
    if (!deck) { U.toast(T('请先创建并选择目标牌组'), 'error'); return; }
    var p = Plugins.get(deck.pluginId);
    if (p.mode !== 'cloze') {
      // 目标牌组不是挖空卡型：自动切到内置挖空卡型
      var cl = Plugins.get('builtin.cloze');
      deck = DB.updateDeck(deckId, { pluginId: cl.id });
      p = cl;
      U.toast(T('目标牌组已切换为「挖空（Cloze）」卡型'));
    }
    var f = Plugins.defaultFields(p);
    f[Plugins.clozeFieldKey(p)] = markup;
    if (f.extra !== undefined) f.extra = App.cz.extra;
    var defs = Cloze.toCards(markup, { oneCardPerBlank: App.cz.oneCardPerBlank });
    DB.createCardsBulk(defs.map(function (d) {
      return { deckId: deckId, pluginId: p.id, fields: f, clozeIndex: d.clozeIndex };
    }));
    U.toast(T('已保存 {n} 张卡片到「', {n: defs.length}) + deck.name + T('」'), 'ok');
    App.cz.markup = '';
    App.cz.extra = '';
    setDeck(deckId);
    App.route = 'study';
    startStudy();
    render();
  }

  function installFromPaste() {
    var ta = document.getElementById('pl-paste');
    var txt = ta ? ta.value.trim() : '';
    if (!txt) { U.toast(T('先粘贴插件 JSON'), 'error'); return; }
    doInstall(txt);
  }

  function doInstall(text, forceOverwrite) {
    var obj;
    try { obj = JSON.parse(text); }
    catch (e) {
      App.pl.result = { ok: false, errors: [T('JSON 语法错误：') + e.message] };
      render(true);
      return;
    }
    var v = Plugins.validate(obj);
    var res = v.ok ? Plugins.install(obj, { overwrite: !!forceOverwrite || App.pl.overwrite }) : { ok: false, errors: v.errors };
    // 提示里要显示**当前语言**下的插件名：装的是示例插件时，
    // obj.name 是 json 里写死的中文，英文界面下会突然蹦出一句中文。
    var shownName = (Plugins.localize(obj) || {}).name || obj.name || obj.id;
    App.pl.result = {
      ok: res.ok,
      errors: (res.errors || []),
      warnings: (res.warnings || v.warnings || []),
      name: shownName
    };
    if (res.ok) {
      refreshPluginCSS();
      var ta = document.getElementById('pl-paste');
      if (ta) ta.value = '';
      U.toast(T('插件「{n}」安装成功', {n: shownName}), 'ok');
    }
    render(true);
  }

  // 读内置示例清单。装在 APK 里时 plugins/ 目录是 assets，文件选择器看不到，
  // 所以只能让 App 自己把清单 fetch 回来（和网页同一目录，能读到）。
  // 直接双击打开 index.html（file://）时这个 fetch 会被 CORS 拦掉 —— 那时给出提示。
  function loadExamples() {
    App.pl.examples = 'load';
    App.pl.examplesErr = '';
    render(true);
    global.fetch('plugins/index.json', { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (idx) {
        var list = (idx && idx.examples) || [];
        if (!list.length) throw new Error(T('清单里没有 examples'));
        // 顺手把每个插件的 id 读出来，好在列表里标出「已安装」
        return Promise.all(list.map(function (ex) {
          return global.fetch('plugins/' + ex.file, { cache: 'no-store' })
            .then(function (r) { return r.ok ? r.text() : ''; })
            .then(function (txt) {
              var id = '';
              try { id = JSON.parse(txt).id || ''; } catch (e) { id = ''; }
              // i18n 要从清单原样带上：下面 localizeMeta() 就靠它翻 name/tags/desc
              return { file: ex.file, name: ex.name, icon: ex.icon, tags: ex.tags, desc: ex.desc,
                       id: id || ex.id || '', i18n: ex.i18n };
            })
            .catch(function () {
              return { file: ex.file, name: ex.name, icon: ex.icon, tags: ex.tags, desc: ex.desc,
                       id: ex.id || '', i18n: ex.i18n };
            });
        }));
      })
      .then(function (list) {
        App.pl.examplesList = list;
        App.pl.examples = 'ready';
        render(true);
      })
      .catch(function (e) {
        App.pl.examples = 'err';
        App.pl.examplesErr = (e && e.message) ? e.message : String(e);
        render(true);
      });
  }

  function toggleExamples() {
    if (App.pl.examples === 'ready' || App.pl.examples === 'load') {
      App.pl.examples = '';
      render(true);
      return;
    }
    loadExamples();
  }

  // 一键安装内置示例。force 覆盖开关让「重新安装」也能走通。
  function installExample(file) {
    U.toast(T('正在安装 {n} …', {n: file}));
    global.fetch('plugins/' + file, { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      })
      .then(function (txt) { doInstall(txt, true); })
      .catch(function (e) {
        App.pl.result = { ok: false, errors: [T('读取 {n} 失败：', {n: file}) + ((e && e.message) || e)] };
        render(true);
      });
  }

  function installFromFile() {
    U.pickFile('.json,application/json').then(function (f) {
      if (!f) return;
      doInstall(f.text);
    });
  }

  function installFromUrl() {
    U.promptBox(T('从网址安装插件'), [
      { key: 'url', label: T('插件 JSON 的 URL'), value: 'https://', placeholder: 'https://example.com/my.plugin.json' }
    ]).then(function (r) {
      if (!r || !r.url) return;
      U.toast(T('正在下载…'));
      fetch(r.url).then(function (res) { return res.text(); }).then(function (txt) {
        doInstall(txt);
      }).catch(function (err) {
        App.pl.result = { ok: false, errors: [T('下载失败：{n}（可能是 CORS 限制）', {n: err.message})] };
        render(true);
      });
    });
  }

  function showPluginDoc() {
    var doc = [
      T('<div class="msg msg--ok"><b>插件 = 一个 JSON 对象</b>，丢进插件页即可扩展新的卡片类型，无需改代码。</div>'),
      T('<div class="section-title" style="margin-top:14px">顶层字段</div>'),
      '<div class="mono" style="line-height:2;font-size:.76rem">',
      T('id          <span class="muted">必填，唯一标识，如 my.type</span><br>'),
      T('name        <span class="muted">必填，显示名</span><br>'),
      T('icon        <span class="muted">可选，emoji</span><br>'),
      T('version     <span class="muted">可选，如 1.0.0</span><br>'),
      T('apiVersion  <span class="muted">必填，当前为 1</span><br>'),
      T('description <span class="muted">可选，一句话说明</span><br>'),
      T('mode        <span class="muted">template（默认）或 cloze</span><br>'),
      T('fields      <span class="muted">必填，字段数组</span><br>'),
      T('templates   <span class="muted">必填，{front, back}</span><br>'),
      T('css         <span class="muted">可选，该卡型样式</span><br>'),
      T('ai          <span class="muted">可选，{kind, prompt}</span>'),
      '</div>',
      T('<div class="section-title" style="margin-top:16px">fields[] 字段</div>'),
      '<div class="mono" style="line-height:2;font-size:.76rem">',
      T('key      <span class="muted">必填，模板里用 {{key}} 引用</span><br>'),
      T('label    <span class="muted">必填，编辑器里的显示名</span><br>'),
      'type     <span class="muted">text | textarea | number | select | list | tags | cloze | date | checkbox</span><br>',
      T('required <span class="muted">true 时保存前必须填写</span><br>'),
      T('placeholder / hint / default / options(select 用)'),
      '</div>',
      T('<div class="section-title" style="margin-top:16px">模板语法（Mustache 子集）</div>'),
      '<div class="mono" style="line-height:2;font-size:.76rem">',
      T('{{key}}              <span class="muted">输出字段（HTML 转义）</span><br>'),
      T('{{{key}}}            <span class="muted">输出字段（不转义，可含 HTML）</span><br>'),
      T('{{#key}}…{{/key}}    <span class="muted">区块：数组则循环，真值则渲染一次</span><br>'),
      T('{{^key}}…{{/key}}    <span class="muted">反向区块：为空时渲染</span><br>'),
      T('{{.}}                <span class="muted">循环中的当前元素</span>'),
      '</div>',
      T('<div class="section-title" style="margin-top:16px">内置过滤器（用 | 串联）</div>'),
      '<div class="mono" style="line-height:2;font-size:.76rem">',
      T('nl2br upper lower trim length json first last join:分隔符 default:兜底 wrap:前后缀 repeat:次数 shuffle list'),
      '</div>',
      T('<div class="muted" style="margin-top:8px">例：{{back|nl2br}}　{{#choices}}<li>{{.}}</li>{{/choices}}</div>'),
      T('<div class="section-title" style="margin-top:16px">AI 契约</div>'),
      '<div class="mono" style="line-height:2;font-size:.76rem">',
      T('ai.kind    <span class="muted">cards（返回字段对象数组）或 cloze（返回带挖空标记的文本）</span><br>'),
      T('ai.prompt  <span class="muted">提示词，可用 {{text}} 与 {{count}} 占位</span>'),
      '</div>',
      T('<div class="muted" style="margin-top:8px">cards 模式下模型需返回：<span class="mono">{"cards":[{字段key: 值, ...}]}</span></div>'),
      T('<div class="section-title" style="margin-top:16px">挖空卡型</div>'),
      T('<div class="muted" style="line-height:1.9">mode 设为 cloze，并保证 fields 里有一个 <span class="mono">type:"cloze"</span> 字段。') +
      T('渲染时该字段会被替换成已渲染好的挖空 HTML（写 {{key}} 或 {{{key}}} 都行）。<br>') +
      T('标记语法：<span class="mono">{{c1::答案}}</span> 或 <span class="mono">{{c1::答案::提示}}</span>；编号决定拆几张卡。</div>')
    ].join('');
    var modal = openModal(T('插件开发文档'), doc,
      T('<button class="btn btn--primary" data-act="m:close">知道了</button>'));
    modal.addEventListener('click', function (e) {
      var act = e.target.getAttribute && e.target.getAttribute('data-act');
      if (act === 'm:close') closeModal(modal);
    });
  }

  function testAIConnection() {
    var box = document.getElementById('set-test-msg');
    if (box) box.innerHTML = T('<div class="msg msg--warn"><span class="spin"></span> 正在请求…</div>');
    AI.test().then(function (r) {
      if (!box) return;
      if (r.ok) box.innerHTML = T('<div class="msg msg--ok">✓ 连接成功<br><span class="mono">') + esc(r.echo) + '</span></div>';
      else box.innerHTML = '<div class="msg msg--err">✕ ' + esc(r.error) + (r.detail ? '<br><span class="mono">' + esc(r.detail) + '</span>' : '') + '</div>';
    });
  }

  function applyPreset(v) {
    var map = {
      deepseek: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
      openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
      ollama: { baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5:7b', apiKey: 'ollama' },
      siliconflow: { baseUrl: 'https://api.siliconflow.cn/v1', model: 'Qwen/Qwen2.5-7B-Instruct' }
    };
    var p = map[v];
    if (!p) return;
    DB.saveSettings({ ai: p });
    U.toast(T('已填入 {n} 预设，别忘了填 API Key', {n: v}), 'ok');
    render(true);
  }

  /* ---------------- 备份：导出 / 导入 ----------------
   * 备份就是一只普通 zip（见 DB.exportBundle）：牌组与卡片、成长数据、
   * 设置、自定义 CSS、每个插件各占一个文件。这样做的好处不只是「看起来清楚」，
   * 而是它可以被外部工具拆开改：换肤只要把 custom.css 换掉再打回去。
   */
  function bundleFileName() {
    return 'flashcards-backup-' + new Date().toISOString().slice(0, 10) + '.zip';
  }

  function exportBundleFlow() {
    var b = bundleBytesOrToast();
    if (!b) return;
    U.downloadBytes(bundleFileName(), b.bytes, 'application/zip');
    U.toast(T('已导出备份（{n} 个文件）', { n: b.files.length }), 'ok');
  }

  function bundleSummary(m) {
    if (!m || !m.counts) return T('未知内容');
    return T('牌组 {d} 个 · 卡片 {c} 张 · 插件 {p} 个', { d: m.counts.decks, c: m.counts.cards, p: m.counts.plugins });
  }

  function applyBundle(files, mode) {
    var r;
    try { r = DB.importBundle(files, mode); }
    catch (e) { U.toast(T('导入失败：') + e.message, 'error'); return null; }
    refreshPluginCSS();
    render(true);
    var parts = [];
    if (r.decks) parts.push(T('{n} 个牌组', { n: r.decks }));
    if (r.cards) parts.push(T('{n} 张卡片', { n: r.cards }));
    if (r.growth) parts.push(T('成长数据'));
    if (r.css) parts.push(T('自定义 CSS'));
    if (r.plugins) parts.push(T('{n} 个插件', { n: r.plugins }));
    if (r.settings && !parts.length) parts.push(T('设置'));
    U.toast(T('已导入：') + (parts.join(T('、')) || T('没有可导入的内容')), 'ok');
    if (r.skipped && r.skipped.length) {
      U.toast(T('跳过了 {n} 项：', { n: r.skipped.length }) + r.skipped.join(T('、')), 'error');
    }
    return r;
  }

  function confirmBundleImport(files) {
    var m = null;
    if (files['manifest.json']) { try { m = JSON.parse(files['manifest.json']); } catch (e) { m = null; } }
    var head = T('这个包里是：') + bundleSummary(m) + T('。');
    U.confirmBox(
      T('导入备份'),
      head + T('选择「合并」会保留现有数据（重复牌组自动改名）；选择「替换」将清空现有数据。'),
      T('合并导入')
    ).then(function (ok) {
      if (ok) { applyBundle(files, 'merge'); return; }
      return U.confirmBox(T('替换导入'), T('这会清空当前所有数据，确定吗？'), T('确认替换')).then(function (ok2) {
        if (ok2) applyBundle(files, 'replace');
      });
    });
  }

  function importBundleFile(f) {
    Zip.read(f.bytes).then(function (entries) {
      var files = {};
      entries.forEach(function (e) {
        var n = String(e.name || '').replace(/\\/g, '/').replace(/^\.\//, '');
        if (!n || /\/$/.test(n)) return;                 // 目录项
        if (n.indexOf('__MACOSX/') === 0 || n.split('/').pop() === '.DS_Store') return; // mac 打的包
        files[n] = Zip.text(e.bytes);
      });
      if (!DB.isBundle(files)) { U.toast(T('这个 zip 里没有本 App 的备份文件'), 'error'); return; }
      confirmBundleImport(files);
    }).catch(function (e) {
      U.toast(T('读取 zip 失败：') + e.message, 'error');
    });
  }

  /** 老的 .json 备份仍然吃得下（很多人手里还有） */
  function importJsonFile(f) {
    var data;
    try { data = JSON.parse(Zip.text(f.bytes)); }
    catch (e) { U.toast(T('文件不是合法 JSON'), 'error'); return; }
    U.confirmBox(T('导入备份'), T('选择「合并」会保留现有数据（重复牌组自动改名）；选择「替换」将清空现有数据。'), T('合并导入')).then(function (ok) {
      try {
        if (ok) {
          var r = DB.importAll(data, 'merge');
          U.toast(T('合并完成：{n} 牌组 / ', { n: r.decks }) + r.cards + T(' 卡片'), 'ok');
          if (data.plugins) {
            data.plugins.forEach(function (p) { try { Plugins.install(p, { overwrite: true }); } catch (e) { } });
            refreshPluginCSS();
          }
          render(true);
        } else {
          return U.confirmBox(T('替换导入'), T('这会清空当前所有数据，确定吗？'), T('确认替换')).then(function (ok2) {
            if (!ok2) return;
            DB.importAll(data, 'replace');
            U.toast(T('替换导入完成'), 'ok');
            render(true);
          });
        }
      } catch (e) { U.toast(T('导入失败：') + e.message, 'error'); }
    });
  }

  /* ---- 纯文本搬运：不碰文件系统，也就不需要任何存储权限 ----
   * 为什么要有这条路：在 WebView 里「下载文件」要么被 blob: 吞掉、要么
   * 落到壳自己去写 /storage/emulated/0/Download（壳没声明任何存储权限，
   * 在 Android 10+ 上注定失败）。而「把一段文本放进剪贴板」是任何
   * WebView 都一定做得到的事，所以导出/导入都留了这条兜底通道。 */
  function bundleBytesOrToast() {
    var files, bytes;
    try { files = DB.exportBundle(); }
    catch (e) { U.toast(T('导出失败：') + e.message, 'error'); return null; }
    try { bytes = Zip.write(files); }
    catch (e) { U.toast(T('打包失败：') + e.message, 'error'); return null; }
    return { files: files, bytes: bytes };
  }

  function exportTextFlow() {
    var b = bundleBytesOrToast();
    if (!b) return;
    var text = Zip.base64(b.bytes);
    var kb = Math.max(1, Math.round(text.length / 1024));
    var body = T('<div class="muted" style="margin-bottom:8px">下面这段文本就是你的全部备份（') +
      b.files.length + T(' 个文件，约 ') + kb + T(' KB）。整段复制走，存进记事本、发给自己、丢进网盘都行；换手机时用「从文本导入」粘回来即可。</div>') +
      '<textarea id="bk-text" class="mono" readonly rows="10" spellcheck="false" ' +
      'style="width:100%;font-size:12px">' + esc(text) + '</textarea>';
    var actions = T('<button class="btn btn--ghost" data-act="m:close">关闭</button>') +
      T('<button class="btn btn--primary" data-act="bk:copy">复制这段文本</button>');
    var modal = openModal(T('备份文本'), body, actions);
    modal.addEventListener('click', function (e) {
      var act = e.target.getAttribute && e.target.getAttribute('data-act');
      if (act === 'm:close') return closeModal(modal);
      if (act !== 'bk:copy') return;
      var ta = $('#bk-text', modal);
      if (ta) { ta.focus(); ta.select(); }
      U.copyText(text).then(function (ok) {
        U.toast(ok ? T('已复制到剪贴板') : T('复制失败，请长按上面的文本手动全选复制'), ok ? 'ok' : 'error');
      });
    });
  }

  function importTextFlow() {
    var body = T('<div class="muted" style="margin-bottom:8px">把「复制备份文本」得到的那一整段粘进来（换行、空格都会被忽略）。</div>') +
      '<textarea id="bk-in" class="mono" rows="10" spellcheck="false" ' +
      'style="width:100%;font-size:12px" placeholder="' + esc(T('在这里粘贴备份文本…')) + '"></textarea>';
    var actions = T('<button class="btn btn--ghost" data-act="m:close">取消</button>') +
      T('<button class="btn btn--primary" data-act="bk:load">导入</button>');
    var modal = openModal(T('从文本导入'), body, actions);
    modal.addEventListener('click', function (e) {
      var act = e.target.getAttribute && e.target.getAttribute('data-act');
      if (act === 'm:close') return closeModal(modal);
      if (act !== 'bk:load') return;
      var ta = $('#bk-in', modal);
      var raw = ta ? String(ta.value || '').trim() : '';
      if (!raw) { U.toast(T('还没有粘贴内容'), 'error'); return; }
      var bytes;
      try { bytes = Zip.unbase64(raw); }
      catch (err) { U.toast(T('这段文本不是合法的备份：') + err.message, 'error'); return; }
      // 认 zip 魔数，而不是靠用户说它是什么
      if (!(bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4b)) {
        U.toast(T('这段文本解出来不是备份数据，可能没复制全'), 'error');
        return;
      }
      closeModal(modal);
      importBundleFile({ bytes: bytes });
    });
  }

  function importBackupFlow() {
    U.pickFileBinary('.zip,.json,application/zip,application/json').then(function (f) {
      if (!f || !f.bytes || !f.bytes.length) return;
      // 认 zip 的魔数而不是扩展名：别人改名成 .json 也照样能读
      var isZip = f.bytes.length > 3 && f.bytes[0] === 0x50 && f.bytes[1] === 0x4b;
      if (isZip) importBundleFile(f); else importJsonFile(f);
    });
  }

  /* ============================================================
   * 绑定视图内的输入（避免每次输入都整体重绘）
   * ============================================================ */
  /**
   * 渲染后的补强：页面里大量用 <div class="item" data-act="..."> 当按钮，
   * 语义上不是按钮 —— 键盘 Tab 到不了，读屏也认不出来。
   * 这里统一给它们补上 role/tabindex（键盘激活由 onKeyDown 负责）。
   * 内部还嵌着真按钮的容器要跳过：给它们套 role="button" 会让读屏
   * 忽略掉里面的按钮，比不加还糟。
   */
  function bindView() {
    var v = document.getElementById('view');
    if (!v) return;
    $$('[data-act]', v).forEach(function (n) {
      var tag = n.tagName.toLowerCase();
      if (tag === 'button' || tag === 'a' || tag === 'input' || tag === 'select' || tag === 'textarea') return;
      if (n.hasAttribute('role') || n.hasAttribute('tabindex')) return;
      if (n.querySelector('button, a, input, select, textarea')) return;
      n.setAttribute('role', 'button');
      n.setAttribute('tabindex', '0');
    });
  }

  /* ============================================================
   * 启动
   * ============================================================ */
  /**
   * 语言定了之后才该发生的事。
   * 首次使用先建示例牌组（用**选中语言**的名字与内容），否则直接进主界面。
   */
  function afterLang() {
    if (!DB.listDecks().length) {
      // 先把 App 画出来，弹层才有背景可挂；否则取消后是一片空白
      render();
      setTimeout(function () {
        U.confirmBox(T('欢迎使用闪卡 👋'),
          T('要现在创建一个示例牌组吗？\n会内置「挖空」和「基础问答」两张演示卡，方便你快速上手。'),
          T('创建示例')).then(function (ok) {
            if (!ok) { render(); return; }
            var d1 = DB.createDeck({ name: T('示例 · 挖空'), pluginId: 'builtin.cloze' });
            DB.createCard(d1.id, 'builtin.cloze', {
              text: T('人体最大的器官是{{c1::皮肤}}，它分为{{c2::表皮}}和{{c3::真皮}}两层。'),
              extra: T('成人的皮肤面积约 1.5–2 平方米。')
            }, [T('生物')]);
            var d2 = DB.createDeck({ name: T('示例 · 基础问答'), pluginId: 'builtin.basic' });
            DB.createCard(d2.id, 'builtin.basic', {
              front: T('SM-2 算法中的「难度因子（Ease Factor）」初始值通常是多少？'),
              back: T('2.5。每次评分后按 0.15~0.2 的幅度调整，并夹在 1.3 ~ 3.0 之间。'),
              note: T('本应用用的就是这套规则的简化版。')
            }, [T('算法')]);
            setDeck(d1.id);
            startStudy();
            render();
            U.toast(T('示例牌组已创建，点卡片看答案，再评分'), 'ok');
          });
      }, 300);
    } else {
      currentDeck();
      render();
    }
  }

  function init() {
    applyTheme();
    refreshPluginCSS();
    // 启动就悄悄存一份快照。放在最前面：万一后面的初始化把数据搞坏了，
    // 至少快照里还是上一次的好状态。
    DB.snapshotOnBoot();
    if (global.matchMedia) {
      try {
        global.matchMedia('(prefers-color-scheme: light)').addEventListener('change', function () {
          if (DB.getSettings().ui.theme === 'auto') applyTheme();
        });
      } catch (e) { }
    }
    document.addEventListener('click', onClick, false);
    document.addEventListener('change', onChange, false);
    document.addEventListener('input', onInput, false);
    document.addEventListener('keydown', onKeyDown, false);

    var saved = DB.getSettings().ui.lang;
    I18n.setLang(saved || I18n.DEFAULT_LANG);
    // 从没选过语言：先停在语言选择页，选完 pickLang() 会接手走 afterLang()
    if (!saved) { render(); return; }
    afterLang();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  global.App = App;
})(window);
