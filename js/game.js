/* ============================================================
 * game.js —— 游戏化成长体系
 *
 *   两套彼此独立的成长：
 *     · 角色（这里）：经验 / 等级 / 称号 / 徽章 / 连续天数 / 连击 / 任务
 *     · 卡片（store.js 的 sched.mastery）：0-5 级掌握度 + 休眠
 *
 *   设计原则（刻意的取向，不是没做）：
 *   1. **只加不减**。经验、等级、已解锁的徽章永远不会因为断连、答错而回退。
 *      断连只清空「连击」这一个展示性的计数。没有体力、没有掉级、没有惩罚。
 *      间隔重复本身已经足够让人难受了，成长系统不该再补一刀。
 *   2. **不干预 SRS**。等级/经验不参与调度，掌握度也要等间隔真的拉到
 *      MATURE_DAYS 才允许升到 5 级进入休眠（见 store.js 的 applyMastery）。
 *      游戏化只做「反馈」，不做「决策」。
 *   3. 所有渲染出的组件都带 fc-* 类名 + CSS 变量，用户能用自定义 CSS 全改。
 *
 *   数据分两块存：'game' = 角色本身，'gstats' = 按天的学习流水。
 *   两块都能整体导出/导入成 JSON（见 exportJSON / importJSON）。
 * ============================================================ */
(function (global) {
  'use strict';
  var U = global.U;
  // T 只是个转发函数，真正查词典发生在调用时，所以在这里抓引用是安全的。
  var T = global.I18n.T;

  var KEY = 'game';
  var STATS_KEY = 'gstats';
  var STATS_KEEP_DAYS = 760;   // 两年多一点，够画两年的热力图又不会撑爆 localStorage

  /* ============================================================
   * 日期工具
   * ============================================================ */
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /** 本地时区的 'YYYY-MM-DD'。刻意不用 toISOString：那是 UTC，会让「今天」在晚上错位。 */
  function dayKey(ts) {
    var d = new Date(ts || U.now());
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  /** 在 'YYYY-MM-DD' 上加减天数，返回同格式字符串。 */
  function shiftDay(key, delta) {
    var p = key.split('-');
    var d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
    d.setDate(d.getDate() + delta);
    return dayKey(d.getTime());
  }

  function daysBetween(a, b) {
    var pa = a.split('-'), pb = b.split('-');
    var da = Date.UTC(parseInt(pa[0], 10), parseInt(pa[1], 10) - 1, parseInt(pa[2], 10));
    var db = Date.UTC(parseInt(pb[0], 10), parseInt(pb[1], 10) - 1, parseInt(pb[2], 10));
    return Math.round((db - da) / 86400000);
  }

  /** ISO 周编号，用来给「每周挑战」做种子（同一周内所有人拿到的任务一致）。 */
  function weekKey(ts) {
    var d = new Date(ts || U.now());
    d.setHours(0, 0, 0, 0);
    // 周四锚点法：把日期推到本周四，再按年内的天数算周次
    d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    var week1 = new Date(d.getFullYear(), 0, 4);
    var n = 1 + Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
    return d.getFullYear() + '-W' + pad2(n);
  }

  /* ---------------- 确定性随机：同一天/同一周永远生成同一套任务 ---------------- */
  function seedFrom(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function rngFrom(seed) {
    var s = seed >>> 0;
    return function () {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }
  function pickN(rnd, arr, n) {
    var pool = arr.slice(), out = [];
    while (out.length < n && pool.length) {
      out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    }
    return out;
  }

  /* ============================================================
   * 等级 / 称号
   * ============================================================ */
  /** 升到 L 级需要的累计经验。二次增长：前期一两轮复习就能升级，后期要靠长期积累。 */
  function xpNeededForLevel(L) {
    var n = Math.max(0, L - 1);
    return 60 * n + 20 * n * n;
  }

  var TITLES = [
    { min: 1, id: 'novice', ico: '🌱', name: '见习学徒' },
    { min: 3, id: 'apprentice', ico: '📗', name: '记忆学徒' },
    { min: 5, id: 'hunter', ico: '🏹', name: '知识猎手' },
    { min: 8, id: 'walker', ico: '🥾', name: '记忆行者' },
    { min: 11, id: 'guard', ico: '🛡️', name: '知识守卫' },
    { min: 15, id: 'master', ico: '🎓', name: '记忆大师' },
    { min: 20, id: 'sage', ico: '🔮', name: '知识贤者' },
    { min: 25, id: 'archon', ico: '👑', name: '记忆执政官' },
    { min: 30, id: 'legend', ico: '🌟', name: '传说记忆者' }
  ];

  function titleFor(level) {
    var out = TITLES[0];
    for (var i = 0; i < TITLES.length; i++) if (level >= TITLES[i].min) out = TITLES[i];
    return out;
  }

  function levelOf(xp) {
    var L = 1;
    while (L < 999 && xp >= xpNeededForLevel(L + 1)) L++;
    return L;
  }

  /* ============================================================
   * 默认数据
   * ============================================================ */
  function defaultState() {
    return {
      xp: 0,
      reviews: 0,
      created: 0,
      clozeCreated: 0,
      correct: 0,
      wrong: 0,
      // 连续天数：今天或昨天学过就算还连着
      streak: 0,
      bestStreak: 0,
      lastStudyDay: '',
      // 连击：连续评「良好/简单」的次数。断连/答错归零，但经验与徽章不动。
      combo: 0,
      bestCombo: 0,
      // 徽章 id -> 获得时间戳
      badges: {},
      // 任务领奖记录 'd:2026-10-15:rev20' -> 时间戳
      claimed: {},
      tasksDone: 0,
      // 曾经达到 5 级（精通）的卡片 id，用于统计「多少张卡被你攻克过」
      mastered: {},
      // 早鸟 / 夜猫子
      earlyBird: false,
      nightOwl: false,
      bornAt: U.now()
    };
  }

  var state = U.Store.get(KEY, null);
  if (!state || typeof state !== 'object') state = defaultState();
  else {
    var d0 = defaultState();
    Object.keys(d0).forEach(function (k) { if (state[k] === undefined) state[k] = d0[k]; });
  }

  var stats = U.Store.get(STATS_KEY, null);
  if (!stats || typeof stats !== 'object' || Array.isArray(stats)) stats = {};

  function persist() {
    U.Store.set(KEY, state);
    U.Store.set(STATS_KEY, stats);
  }

  /** 某天的流水记录（不存在就给一个空壳，不落盘）。 */
  function dayStats(key, create) {
    var k = key || dayKey();
    var s = stats[k];
    if (!s) {
      if (!create) return { reviews: 0, created: 0, cloze: 0, xp: 0, correct: 0, wrong: 0, decks: [] };
      s = stats[k] = { reviews: 0, created: 0, cloze: 0, xp: 0, correct: 0, wrong: 0, decks: [] };
    }
    if (!s.decks) s.decks = [];
    return s;
  }

  function pruneStats() {
    var keys = Object.keys(stats).sort();
    if (keys.length <= STATS_KEEP_DAYS) return;
    keys.slice(0, keys.length - STATS_KEEP_DAYS).forEach(function (k) { delete stats[k]; });
  }

  /* ============================================================
   * 经验
   * ============================================================ */
  var XP = {
    again: 2,
    hard: 5,
    good: 8,
    easy: 10,
    card: 10,
    cloze: 14,
    badge: 20,
    mastered: 25
  };

  /** 连续天数加成：最多 +40%，只影响经验值，不影响调度。 */
  function streakBonus() {
    return 1 + Math.min(state.streak, 20) * 0.02;
  }

  function gainXp(n) {
    var before = levelOf(state.xp);
    state.xp += Math.max(0, Math.round(n));
    var after = levelOf(state.xp);
    dayStats(null, true).xp += Math.round(n);
    return { leveledUp: after > before, from: before, to: after };
  }

  /* ============================================================
   * 徽章
   * ============================================================ */
  var BADGES = [
    { id: 'first_review', ico: '🎬', name: '第一次复习', desc: '完成你的第一次评分', test: function (s) { return s.reviews >= 1; } },
    { id: 'ten_reviews', ico: '📖', name: '热身完毕', desc: '累计复习 10 次', test: function (s) { return s.reviews >= 10; } },
    { id: 'hundred', ico: '📚', name: '百次复习', desc: '累计复习 100 次', test: function (s) { return s.reviews >= 100; } },
    { id: 'thousand', ico: '🏛️', name: '千锤百炼', desc: '累计复习 1000 次', test: function (s) { return s.reviews >= 1000; } },
    { id: 'streak3', ico: '🔥', name: '三日不辍', desc: '连续学习 3 天', test: function (s) { return s.bestStreak >= 3; } },
    { id: 'streak7', ico: '🏕️', name: '一周不断', desc: '连续学习 7 天', test: function (s) { return s.bestStreak >= 7; } },
    { id: 'streak30', ico: '🌋', name: '一月成习', desc: '连续学习 30 天', test: function (s) { return s.bestStreak >= 30; } },
    { id: 'combo10', ico: '⚡', name: '十连击', desc: '连续答对 10 张', test: function (s) { return s.bestCombo >= 10; } },
    { id: 'combo50', ico: '🌩️', name: '五十连击', desc: '连续答对 50 张', test: function (s) { return s.bestCombo >= 50; } },
    { id: 'cloze10', ico: '🕳️', name: '挖空新手', desc: '亲手造 10 张挖空卡', test: function (s) { return s.clozeCreated >= 10; } },
    { id: 'cloze100', ico: '⛏️', name: '挖空工匠', desc: '亲手造 100 张挖空卡', test: function (s) { return s.clozeCreated >= 100; } },
    { id: 'first_master', ico: '🏅', name: '首张精通', desc: '把一张卡练到 5 级', test: function (s) { return Object.keys(s.mastered).length >= 1; } },
    { id: 'master10', ico: '🎖️', name: '十张精通', desc: '把 10 张卡练到 5 级', test: function (s) { return Object.keys(s.mastered).length >= 10; } },
    { id: 'master100', ico: '🏆', name: '百张精通', desc: '把 100 张卡练到 5 级', test: function (s) { return Object.keys(s.mastered).length >= 100; } },
    { id: 'level5', ico: '⭐', name: '到达 5 级', desc: '角色等级达到 5 级', test: function (s) { return levelOf(s.xp) >= 5; } },
    { id: 'level10', ico: '🌟', name: '到达 10 级', desc: '角色等级达到 10 级', test: function (s) { return levelOf(s.xp) >= 10; } },
    { id: 'level20', ico: '💫', name: '到达 20 级', desc: '角色等级达到 20 级', test: function (s) { return levelOf(s.xp) >= 20; } },
    { id: 'task10', ico: '✅', name: '任务达人', desc: '完成 10 个挑战任务', test: function (s) { return s.tasksDone >= 10; } },
    { id: 'task50', ico: '🧭', name: '挑战常客', desc: '完成 50 个挑战任务', test: function (s) { return s.tasksDone >= 50; } },
    { id: 'early_bird', ico: '🌅', name: '早起鸟', desc: '在早上 7 点前复习过', test: function (s) { return !!s.earlyBird; } },
    { id: 'night_owl', ico: '🦉', name: '夜猫子', desc: '在晚上 23 点后复习过', test: function (s) { return !!s.nightOwl; } },
    { id: 'explorer', ico: '🗺️', name: '多线并行', desc: '一天里复习了 2 个以上的牌组', test: function (s) {
      return Object.keys(stats).some(function (k) { return (stats[k].decks || []).length >= 2; });
    } }
  ];

  /** 检查并发放。只新增不撤销——所以不能写「取反」型的条件。 */
  function evaluateBadges() {
    var got = [];
    BADGES.forEach(function (b) {
      if (state.badges[b.id]) return;
      var ok = false;
      try { ok = !!b.test(state); } catch (e) { ok = false; }
      if (ok) {
        state.badges[b.id] = U.now();
        got.push(b);
      }
    });
    if (got.length) {
      // 徽章本身也给经验：解锁的即时正反馈
      var bonus = got.length * XP.badge;
      state.xp += bonus;
      dayStats(null, true).xp += bonus;
    }
    return got;
  }

  function badgeList() {
    return BADGES.map(function (b) {
      return {
        id: b.id, ico: b.ico, name: b.name, desc: b.desc,
        got: !!state.badges[b.id],
        at: state.badges[b.id] || 0
      };
    });
  }

  /* ============================================================
   * 连续天数 / 连击
   * ============================================================ */
  function touchDay() {
    var today = dayKey();
    if (state.lastStudyDay === today) return;
    if (state.lastStudyDay && daysBetween(state.lastStudyDay, today) === 1) {
      state.streak += 1;
    } else {
      state.streak = 1;          // 断连只重来连续天数
    }
    state.lastStudyDay = today;
    if (state.streak > state.bestStreak) state.bestStreak = state.streak;
  }

  /**
   * 断连检测：把「其实已经断了但没人来学」的情况也如实反映出来。
   * 注意这里**只动 streak / combo**，经验和已得徽章一律不碰。
   */
  function refreshStreak() {
    if (!state.lastStudyDay) { state.streak = 0; state.combo = 0; return; }
    var gap = daysBetween(state.lastStudyDay, dayKey());
    if (gap > 1) {
      state.streak = 0;
      state.combo = 0;
    }
  }

  function streakInfo() {
    refreshStreak();
    var today = dayKey();
    var studiedToday = state.lastStudyDay === today;
    // 今天还没学但昨天学了：连续天数仍然算数，直到今天结束
    var alive = studiedToday || (state.lastStudyDay && daysBetween(state.lastStudyDay, today) === 1);
    return {
      current: alive ? state.streak : 0,
      best: state.bestStreak,
      studiedToday: studiedToday,
      todayCount: dayStats(today).reviews,
      combo: state.combo,
      bestCombo: state.bestCombo,
      lastDay: state.lastStudyDay
    };
  }

  /* ============================================================
   * 钩子：复习 / 建卡
   * ============================================================ */
  /**
   * 每次评分后调用（由 store.schedule 触发）。
   * 返回值里带升级/新徽章信息，交给界面弹提示。
   */
  function onReview(card, rating) {
    var before = levelOf(state.xp);
    var today = dayKey();
    var ds = dayStats(today, true);

    touchDay();
    var hour = new Date().getHours();
    if (hour < 7) state.earlyBird = true;
    if (hour >= 23) state.nightOwl = true;

    state.reviews += 1;
    ds.reviews += 1;
    if (card && card.deckId && ds.decks.indexOf(card.deckId) < 0) ds.decks.push(card.deckId);

    if (rating === 0) {
      state.wrong += 1;
      ds.wrong += 1;
      // 答错：连击归零，但**不清经验、不清等级、不清徽章**
      state.combo = 0;
    } else {
      state.correct += 1;
      ds.correct += 1;
      state.combo += 1;
      if (state.combo > state.bestCombo) state.bestCombo = state.combo;
    }

    var base = [XP.again, XP.hard, XP.good, XP.easy][rating] || XP.good;
    var gained = Math.round(base * streakBonus());
    gainXp(gained);

    var got = evaluateBadges();
    persist();
    return {
      xp: gained,
      leveledUp: levelOf(state.xp) > before,
      from: before,
      to: levelOf(state.xp),
      badges: got,
      combo: state.combo
    };
  }

  /** 判断一张卡是不是挖空卡：优先问插件系统，拿不到再退回按 id 猜。 */
  function isClozeCard(c) {
    try {
      var p = global.Plugins && global.Plugins.get(c.pluginId);
      if (p && p.mode === 'cloze') return true;
    } catch (e) { /* 插件还没加载：忽略 */ }
    return (c.pluginId || '').indexOf('cloze') >= 0;
  }

  /** 新建卡片后调用（由 store.createCard / createCardsBulk 触发）。 */
  function onCardsCreated(list) {
    if (!list || !list.length) return { xp: 0, badges: [] };
    var cloze = list.filter(isClozeCard).length;
    var xp = list.length * XP.card + cloze * (XP.cloze - XP.card);
    state.created += list.length;
    state.clozeCreated += cloze;
    var ds = dayStats(null, true);
    ds.created += list.length;
    ds.cloze += cloze;
    gainXp(xp);
    var got = evaluateBadges();
    persist();
    return { xp: xp, badges: got };
  }

  /** 一张卡第一次升到 5 级时调用（由 store.applyMastery 触发）。 */
  function onMastered(cardId) {
    if (!cardId || state.mastered[cardId]) return { xp: 0, badges: [] };
    state.mastered[cardId] = U.now();
    gainXp(XP.mastered);
    var got = evaluateBadges();
    persist();
    return { xp: XP.mastered, badges: got };
  }

  /* ============================================================
   * 每日 / 每周挑战
   *
   *   任务不是写死的清单，而是「按日期做种子的随机」：
   *   同一天打开几次都看到同一套，换一天自动换一套，不需要后台也不需要存清单。
   * ============================================================ */
  var DAILY_POOL = [
    { kind: 'reviews', ico: '📖', lo: 10, hi: 40, step: 5, xp: 35 },
    { kind: 'newCards', ico: '✏️', lo: 3, hi: 15, step: 1, xp: 35 },
    { kind: 'correct', ico: '🎯', lo: 10, hi: 40, step: 5, xp: 40 },
    { kind: 'cloze', ico: '🕳️', lo: 1, hi: 5, step: 1, xp: 40 },
    { kind: 'xp', ico: '⭐', lo: 100, hi: 320, step: 20, xp: 45 },
    { kind: 'decks', ico: '🗂️', lo: 1, hi: 3, step: 1, xp: 30 }
  ];

  var WEEKLY_POOL = [
    { kind: 'reviews', ico: '📚', lo: 150, hi: 500, step: 25, xp: 180 },
    { kind: 'newCards', ico: '📝', lo: 30, hi: 100, step: 5, xp: 180 },
    { kind: 'mastered', ico: '🏅', lo: 3, hi: 12, step: 1, xp: 200 },
    { kind: 'days', ico: '🔥', lo: 4, hi: 7, step: 1, xp: 200 }
  ];

  /* 任务措辞不在这里 —— 这里只出「做什么、做多少」，
   * 中文原文和英文译文都归界面层（app.js 的 taskText）。理由和 TABS 一样：
   * 模块顶层写 T('复习 {n} 张卡') 会把文案冻在加载时的语言上。 */

  function buildTasks(pool, rnd, count, scope, key) {
    return pickN(rnd, pool, count).map(function (p) {
      var steps = Math.floor((p.hi - p.lo) / p.step + 1);
      var n = p.lo + Math.floor(rnd() * steps) * p.step;
      return {
        id: scope + ':' + key + ':' + p.kind + ':' + n,
        scope: scope,
        kind: p.kind,
        ico: p.ico,
        target: n,
        xp: p.xp
      };
    });
  }

  /** 按天/周把最近一段时间的学习量加起来。 */
  function sumRange(fromKey, toKey, field) {
    var total = 0, k = fromKey;
    var guard = 0;
    while (guard++ < 400) {
      var s = stats[k];
      if (s) total += (s[field] || 0);
      if (k === toKey) break;
      k = shiftDay(k, 1);
  }
    return total;
  }

  function progressOf(task) {
    var today = dayKey();
    var s = dayStats(today);
    switch (task.kind) {
      case 'reviews': return { now: s.reviews };
      case 'newCards': return { now: s.created };
      case 'correct': return { now: s.correct };
      case 'cloze': return { now: s.cloze };
      case 'xp': return { now: s.xp };
      case 'decks': return { now: (s.decks || []).length };
      case 'mastered': {
        // 最近 7 天里新精通的卡数（和「本周」任务的窗口一致）
        var from = shiftDay(today, -6);
        var n = 0;
        Object.keys(state.mastered).forEach(function (id) {
          var k = dayKey(state.mastered[id]);
          if (k >= from && k <= today) n++;
        });
        return { now: n };
      }
      case 'days': {
        var from2 = shiftDay(today, -6), cnt = 0;
        for (var i = 0; i < 7; i++) {
          var st = stats[shiftDay(from2, i)];
          if (st && (st.reviews || 0) > 0) cnt++;
        }
        return { now: cnt };
      }
      default: return { now: 0 };
    }
  }

  function challenges() {
    var today = dayKey();
    var wk = weekKey();
    var list = buildTasks(DAILY_POOL, rngFrom(seedFrom('d:' + today)), 3, 'd', today)
      .concat(buildTasks(WEEKLY_POOL, rngFrom(seedFrom('w:' + wk)), 2, 'w', wk));
    return list.map(function (t) {
      var p = progressOf(t);
      return {
        id: t.id, scope: t.scope, kind: t.kind, ico: t.ico,
        xp: t.xp, target: t.target,
        now: Math.min(p.now, t.target), raw: p.now,
        pct: Math.min(100, Math.round((p.now / t.target) * 100)),
        done: p.now >= t.target,
        claimed: !!state.claimed[t.id]
      };
    });
  }

  /** 领奖：完成且没领过的任务发经验。返回本次发出的总经验。 */
  function claimTasks() {
    var got = 0, count = 0;
    challenges().forEach(function (c) {
      if (!c.done || c.claimed) return;
      state.claimed[c.id] = U.now();
      state.tasksDone += 1;
      state.xp += c.xp;
      dayStats(null, true).xp += c.xp;
      got += c.xp;
      count += 1;
    });
    if (got) {
      evaluateBadges();
      persist();
    }
    return { xp: got, count: count };
  }

  /* ============================================================
   * 学习日历热力图
   * ============================================================ */
  /**
   * 返回按列（每列 7 天）组织的格子，最后一个是包含今天的这一列。
   * 和 GitHub 一样：列 = 周，行 = 星期几。
   */
  function heatmap(weeks) {
    weeks = weeks || 26;
    var today = dayKey();
    // 把游标挪到「今天所在这一列」的周日，方便对齐行
    var dow = (new Date(U.now()).getDay() + 6) % 7; // 0 = 周一
    var end = shiftDay(today, 6 - dow);             // 本列的周日
    var start = shiftDay(end, -(weeks * 7 - 1));

    var max = 0, cells = [];
    var k = start;
    for (var i = 0; i < weeks * 7; i++) {
      var s = stats[k];
      var count = s ? (s.reviews || 0) + (s.created || 0) : 0;
      if (count > max) max = count;
      cells.push({ key: k, count: count, reviews: s ? (s.reviews || 0) : 0, xp: s ? (s.xp || 0) : 0 });
      k = shiftDay(k, 1);
    }

    var cols = [];
    for (var c = 0; c < weeks; c++) cols.push(cells.slice(c * 7, c * 7 + 7));

    // 分档：0 / 1-2 / 3-5 / 6-10 / 11+，比按 max 分档更稳定（不会因为某天爆量全年变色）
    function level(n) {
      if (!n) return 0;
      if (n <= 2) return 1;
      if (n <= 5) return 2;
      if (n <= 10) return 3;
      return 4;
    }
    cols.forEach(function (col) {
      col.forEach(function (cell) {
        cell.level = level(cell.count);
        cell.today = cell.key === today;
        cell.future = cell.key > today;
      });
    });

    var activeDays = cells.filter(function (x) { return x.count > 0; }).length;
    return {
      cols: cols,
      weeks: weeks,
      max: max,
      activeDays: activeDays,
      total: cells.reduce(function (a, b) { return a + b.count; }, 0),
      from: start,
      to: today
    };
  }

  /* ============================================================
   * 遗忘曲线
   *
   *   模型就是艾宾浩斯那条最朴素的指数衰减：R(t) = e^(-t/S)。
   *   S（记忆稳定度）从 SRS 反推：SM-2 把下次复习排在 interval 天后，
   *   隐含假设那时还剩 90% 记得住，也就是 e^(-interval/S) = 0.9，
   *   于是 S = interval / ln(1/0.9) ≈ 9.49 × interval。
   *
   *   这样画出来的曲线和调度器是同一套假设，不会出现「图上说该复习了、
   *   调度器却说还早」这种自相矛盾。
   * ============================================================ */
  var TARGET_R = 0.9;
  var LN_TARGET = Math.log(1 / TARGET_R); // ≈ 0.10536
  var DAY = U.DAY;

  function stabilityOf(sched) {
    var iv = (sched && sched.interval) || 0;
    var ease = (sched && sched.ease) || 2.5;
    if (iv <= 0) {
      // 还没形成任何间隔：按「一天内掉到一半」估
      return 0.9;
    }
    // ease 高说明这张卡对你更简单，稳定度再放大一点
    return (iv / LN_TARGET) * Math.min(1.25, Math.max(0.85, ease / 2.5));
  }

  function retentionAt(sched, days) {
    if (days <= 0) return 1;
    return Math.exp(-days / stabilityOf(sched));
  }

  /**
   * 画一条曲线的全部数据。card 必需，logs 可选（不传就从 DB 里按 cardId 捞）。
   */
  function forgetting(card) {
    if (!card) return null;
    var sched = card.sched || {};
    var S = stabilityOf(sched);
    var iv = sched.interval || 0;
    var maxDay = Math.max(7, Math.ceil(S * 3), Math.ceil(iv * 1.6));
    maxDay = Math.min(maxDay, 3650);

    var N = 56, pts = [];
    for (var i = 0; i <= N; i++) {
      var d = (maxDay * i) / N;
      pts.push({ d: d, r: retentionAt(sched, d) });
    }

    // 真实复习记录：x = 距第一次复习多少天，y = 答对 1 / 答错 0
    var logs = [];
    try {
      var all = (global.DB && global.DB.state && global.DB.state.logs) || [];
      logs = all.filter(function (l) { return l.cardId === card.id; });
    } catch (e) { logs = []; }

    var first = logs.length ? logs[0].t : (sched.lastReviewed || U.now());
    var history = logs.slice(-60).map(function (l) {
      return {
        d: Math.max(0, (l.t - first) / DAY),
        ok: l.rating >= 2,
        rating: l.rating
      };
    });

    var sinceLast = sched.lastReviewed ? (U.now() - sched.lastReviewed) / DAY : 0;
    var nextIn = sched.due ? (sched.due - U.now()) / DAY : 0;

    return {
      stability: S,
      interval: iv,
      maxDay: maxDay,
      points: pts,
      history: history,
      reviews: logs.length,
      sinceLast: sinceLast,
      retentionNow: retentionAt(sched, sinceLast),
      nextIn: nextIn,
      target: TARGET_R
    };
  }

  function svgPath(points, w, h, maxDay) {
    return points.map(function (p, i) {
      var x = (p.d / maxDay) * w;
      var y = h - p.r * h;
      return (i ? 'L' : 'M') + x.toFixed(2) + ' ' + y.toFixed(2);
    }).join(' ');
  }

  /**
   * 内联 SVG。全部用 fc-* 类名 + currentColor / CSS 变量着色，
   * 用户可以在自定义 CSS 里改 .fc-curve-line 之类。
   */
  function curveSVG(card, opts) {
    var f = forgetting(card);
    if (!f) return '';
    opts = opts || {};
    var W = 300, H = 130, PAD = 6;

    var maxDay = f.maxDay;
    var iw = W - PAD * 2, ih = H - PAD * 2;
    function X(d) { return PAD + (d / maxDay) * iw; }
    function Y(r) { return PAD + (1 - r) * ih; }

    var path = f.points.map(function (p, i) {
      return (i ? 'L' : 'M') + X(p.d).toFixed(2) + ' ' + Y(p.r).toFixed(2);
    }).join(' ');

    var s = '<svg class="fc-curve" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" ' +
      'aria-label="' + U.esc(T('遗忘曲线')) + '">';

    // 背景网格：90% 目标线 + 50% 线
    s += '<line class="fc-curve-grid" x1="' + PAD + '" y1="' + Y(0.9).toFixed(1) + '" x2="' + (W - PAD) + '" y2="' + Y(0.9).toFixed(1) + '"/>';
    s += '<line class="fc-curve-grid" x1="' + PAD + '" y1="' + Y(0.5).toFixed(1) + '" x2="' + (W - PAD) + '" y2="' + Y(0.5).toFixed(1) + '"/>';
    s += '<text class="fc-curve-axis" x="' + (W - PAD) + '" y="' + (Y(0.9) - 3).toFixed(1) + '" text-anchor="end">90%</text>';
    s += '<text class="fc-curve-axis" x="' + (W - PAD) + '" y="' + (Y(0.5) - 3).toFixed(1) + '" text-anchor="end">50%</text>';

    // 曲线下方的填充
    s += '<path class="fc-curve-area" d="' + path + ' L' + (W - PAD).toFixed(2) + ' ' + (H - PAD) +
      ' L' + PAD + ' ' + (H - PAD) + ' Z"/>';
    s += '<path class="fc-curve-line" d="' + path + '"/>';

    // 真实复习点
    f.history.forEach(function (h) {
      var d = Math.min(h.d, maxDay);
      var x = X(d), y = h.ok ? Y(0.97) : Y(0.06);
      s += '<circle class="fc-curve-dot ' + (h.ok ? 'is-ok' : 'is-bad') + '" cx="' + x.toFixed(2) +
        '" cy="' + y.toFixed(2) + '" r="2.4"/>';
    });

    // 「现在」的位置
    var nowD = Math.max(0, f.history.length ? f.history[f.history.length - 1].d + f.sinceLast : f.sinceLast);
    if (nowD <= maxDay) {
      var nx = X(nowD);
      s += '<line class="fc-curve-now" x1="' + nx.toFixed(2) + '" y1="' + PAD + '" x2="' + nx.toFixed(2) + '" y2="' + (H - PAD) + '"/>';
    }

    s += '</svg>';
    return s;
  }

  /* ============================================================
   * 快照（给「撤销上次评分」用）
   * ============================================================ */
  function snapshot() {
    return { state: U.deepClone(state), today: U.deepClone(dayStats()) };
  }
  function restoreSnapshot(snap) {
    if (!snap) return;
    state = U.deepClone(snap.state);
    if (snap.today) stats[dayKey()] = U.deepClone(snap.today);
    persist();
  }

  /* ============================================================
   * JSON 存取
   *
   *   用户要的是「成长、卡片状态、统计都能通过 JSON 保存与导入导出」。
   *   这里给出的就是那份文档：一个自包含的 JSON，包含角色、每日流水，
   *   以及在 includeCards 时把每张卡的掌握度/休眠状态也带上。
   * ============================================================ */
  function exportJSON(opts) {
    opts = opts || {};
    var out = {
      format: 'flashcards-growth',
      version: 1,
      exportedAt: new Date().toISOString(),
      profile: {
        xp: state.xp,
        level: levelOf(state.xp),
        title: titleFor(levelOf(state.xp)).id,
        reviews: state.reviews,
        created: state.created,
        clozeCreated: state.clozeCreated,
        correct: state.correct,
        wrong: state.wrong,
        streak: state.streak,
        bestStreak: state.bestStreak,
        combo: state.combo,
        bestCombo: state.bestCombo,
        lastStudyDay: state.lastStudyDay,
        masteredCount: Object.keys(state.mastered).length,
        tasksDone: state.tasksDone
      },
      badges: Object.keys(state.badges),
      mastered: Object.keys(state.mastered),
      claimed: Object.keys(state.claimed),
      stats: stats
    };
    if (opts.includeCards) {
      out.cards = (global.DB ? global.DB.listCards() : []).map(function (c) {
        return {
          id: c.id,
          mastery: (c.sched && c.sched.mastery) || 0,
          sleeping: !!(c.sched && c.sched.sleeping),
          interval: (c.sched && c.sched.interval) || 0,
          ease: (c.sched && c.sched.ease) || 2.5,
          reps: (c.sched && c.sched.reps) || 0,
          lapses: (c.sched && c.sched.lapses) || 0,
          due: (c.sched && c.sched.due) || 0
        };
      });
    }
    return out;
  }

  /**
   * 导入。mode:
   *   'replace' 角色数据整体替换
   *   'merge'   经验/统计取较大值或累加，徽章取并集（换设备/多端合并用）
   * includeCards 时会把 cards[] 里的掌握度写回对应卡片。
   */
  function importJSON(data, mode) {
    if (!data || data.format !== 'flashcards-growth') {
      throw new Error('不是有效的成长数据（缺少 format: flashcards-growth）');
    }
    mode = mode || 'replace';
    var p = data.profile || {};

    if (mode === 'replace') {
      state = defaultState();
      state.xp = p.xp || 0;
      state.reviews = p.reviews || 0;
      state.created = p.created || 0;
      state.clozeCreated = p.clozeCreated || 0;
      state.correct = p.correct || 0;
      state.wrong = p.wrong || 0;
      state.streak = p.streak || 0;
      state.bestStreak = p.bestStreak || 0;
      state.combo = p.combo || 0;
      state.bestCombo = p.bestCombo || 0;
      state.lastStudyDay = p.lastStudyDay || '';
      state.tasksDone = p.tasksDone || 0;
      state.badges = {}; (data.badges || []).forEach(function (id) { state.badges[id] = U.now(); });
      state.mastered = {}; (data.mastered || []).forEach(function (id) { state.mastered[id] = U.now(); });
      state.claimed = {}; (data.claimed || []).forEach(function (id) { state.claimed[id] = U.now(); });
      stats = data.stats || {};
    } else {
      function maxNum(a, b) { return Math.max(a || 0, b || 0); }
      state.xp = maxNum(state.xp, p.xp);
      state.reviews = maxNum(state.reviews, p.reviews);
      state.created = maxNum(state.created, p.created);
      state.clozeCreated = maxNum(state.clozeCreated, p.clozeCreated);
      state.correct = maxNum(state.correct, p.correct);
      state.wrong = maxNum(state.wrong, p.wrong);
      state.bestStreak = maxNum(state.bestStreak, p.bestStreak);
      state.bestCombo = maxNum(state.bestCombo, p.bestCombo);
      state.tasksDone = maxNum(state.tasksDone, p.tasksDone);
      if (p.lastStudyDay && p.lastStudyDay > state.lastStudyDay) state.lastStudyDay = p.lastStudyDay;
      (data.badges || []).forEach(function (id) { if (!state.badges[id]) state.badges[id] = U.now(); });
      (data.mastered || []).forEach(function (id) { if (!state.mastered[id]) state.mastered[id] = U.now(); });
      (data.claimed || []).forEach(function (id) { if (!state.claimed[id]) state.claimed[id] = U.now(); });
      var inc = data.stats || {};
      Object.keys(inc).forEach(function (k) {
        var a = stats[k] || { reviews: 0, created: 0, cloze: 0, xp: 0, correct: 0, wrong: 0, decks: [] };
        var b = inc[k] || {};
        a.reviews = maxNum(a.reviews, b.reviews);
        a.created = maxNum(a.created, b.created);
        a.cloze = maxNum(a.cloze, b.cloze);
        a.xp = maxNum(a.xp, b.xp);
        a.correct = maxNum(a.correct, b.correct);
        a.wrong = maxNum(a.wrong, b.wrong);
        if (!a.decks) a.decks = [];
        (b.decks || []).forEach(function (id) { if (a.decks.indexOf(id) < 0) a.decks.push(id); });
        stats[k] = a;
      });
    }

    var cardsTouched = 0;
    if (data.cards && global.DB) {
      data.cards.forEach(function (row) {
        var c = global.DB.getCard(row.id);
        if (!c) return;
        c.sched = c.sched || {};
        c.sched.mastery = U.clamp(row.mastery || 0, 0, 5);
        c.sched.sleeping = !!row.sleeping;
        if (row.due) c.sched.due = row.due;
        cardsTouched++;
      });
      if (cardsTouched) global.DB.persist('cards');
    }

    pruneStats();
    evaluateBadges();
    persist();
    return { xp: state.xp, level: levelOf(state.xp), cards: cardsTouched };
  }

  /* ============================================================
   * 对外
   * ============================================================ */
  function profile() {
    var L = levelOf(state.xp);
    var base = xpNeededForLevel(L);
    var next = xpNeededForLevel(L + 1);
    var st = streakInfo();
    var title = titleFor(L);
    return {
      xp: state.xp,
      level: L,
      title: { id: title.id, name: title.name, ico: title.ico },
      nextTitle: (function () {
        for (var i = 0; i < TITLES.length; i++) if (TITLES[i].min > L) return TITLES[i];
        return null;
      })(),
      inLevel: state.xp - base,
      needLevel: next - base,
      pct: next > base ? Math.round(((state.xp - base) / (next - base)) * 100) : 100,
      toNext: Math.max(0, next - state.xp),
      reviews: state.reviews,
      created: state.created,
      clozeCreated: state.clozeCreated,
      correct: state.correct,
      wrong: state.wrong,
      accuracy: state.reviews ? Math.round((state.correct / state.reviews) * 100) : 0,
      masteredCount: Object.keys(state.mastered).length,
      tasksDone: state.tasksDone,
      badgesGot: Object.keys(state.badges).length,
      badgesTotal: BADGES.length,
      streak: st,
      streakBonus: streakBonus()
    };
  }

  global.Game = {
    XP: XP,
    TITLES: TITLES,
    BADGES: BADGES,
    xpNeededForLevel: xpNeededForLevel,
    levelOf: levelOf,
    titleFor: titleFor,
    profile: profile,
    badgeList: badgeList,
    evaluateBadges: evaluateBadges,
    streakInfo: streakInfo,
    streakBonus: streakBonus,
    addXp: function (n) { var before = levelOf(state.xp); gainXp(n); var b = evaluateBadges(); persist(); return { leveledUp: levelOf(state.xp) > before, badges: b }; },
    onReview: onReview,
    onCardsCreated: onCardsCreated,
    onMastered: onMastered,
    challenges: challenges,
    claimTasks: claimTasks,
    heatmap: heatmap,
    stabilityOf: stabilityOf,
    retentionAt: retentionAt,
    forgetting: forgetting,
    curveSVG: curveSVG,
    dayKey: dayKey,
    weekKey: weekKey,
    shiftDay: shiftDay,
    dayStats: dayStats,
    snapshot: snapshot,
    restoreSnapshot: restoreSnapshot,
    exportJSON: exportJSON,
    importJSON: importJSON,
    // 测试与调试用
    _state: function () { return state; },
    _stats: function () { return stats; },
    _reset: function () { state = defaultState(); stats = {}; persist(); }
  };
})(window);
