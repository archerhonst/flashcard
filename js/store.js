/* ============================================================
 * store.js —— 数据层：牌组 / 卡片 / 复习记录 / SM-2 调度
 * ============================================================ */
(function (global) {
  'use strict';
  var U = global.U;

  var KEYS = {
    decks: 'decks',
    cards: 'cards',
    settings: 'settings',
    logs: 'logs',
    plugins: 'plugins'
  };

  var DEFAULT_SETTINGS = {
    ai: {
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      model: 'gpt-4o-mini',
      temperature: 0.3,
      jsonMode: true,
      timeoutMs: 90000
    },
    study: {
      newPerDay: 20,
      reviewPerDay: 200,
      showTimer: false,
      autoAdvance: false,
      // 挖空卡改成「真打字」而不是「心里想完自己点显示答案」
      typing: false,
      // 答错累计到这个次数就标成「难卡」，提示你拆卡
      leechThreshold: 4
    },
    ui: {
      theme: 'auto',
      // '' = 还没选过语言，启动时会先弹语言选择页（见 app.js 的 renderGate）。
      // 刻意不用 'auto' 当默认值：那样就分不清「用户选过跟随系统」和「从没选过」，
      // 而这两者要不要弹选择页是相反的。
      lang: '',
      fontSize: 16,
      cardMaxWidth: 720,
      // 整段用户 CSS，注入到 <style id="fc-user-css">，作用到整个 App。
      // 放在设置里而不是外挂文件，是因为 APK 里没有可写的静态目录可改。
      customCss: ''
    },
    cloze: {
      defaultCount: 3,
      oneCardPerBlank: true
    }
  };

  function mergeDeep(base, over) {
    var out = JSON.parse(JSON.stringify(base));
    if (!over || typeof over !== 'object') return out;
    Object.keys(over).forEach(function (k) {
      var v = over[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) {
        out[k] = mergeDeep(out[k], v);
      } else if (v !== undefined) {
        out[k] = v;
      }
    });
    return out;
  }

  /* ---------------- 状态 ---------------- */
  var state = {
    decks: U.Store.get(KEYS.decks, []),
    cards: U.Store.get(KEYS.cards, []),
    settings: mergeDeep(DEFAULT_SETTINGS, U.Store.get(KEYS.settings, {})),
    logs: U.Store.get(KEYS.logs, [])
  };

  function persist(what) {
    if (!what || what === 'decks') U.Store.set(KEYS.decks, state.decks);
    if (!what || what === 'cards') U.Store.set(KEYS.cards, state.cards);
    if (!what || what === 'settings') U.Store.set(KEYS.settings, state.settings);
    if (!what || what === 'logs') U.Store.set(KEYS.logs, state.logs);
  }

  /* ---------------- 牌组 ---------------- */
  function listDecks() { return state.decks.slice(); }
  function getDeck(id) { return state.decks.filter(function (d) { return d.id === id; })[0] || null; }

  function createDeck(opts) {
    opts = opts || {};
    var deck = {
      id: U.uid('deck'),
      name: opts.name || '新牌组',
      pluginId: opts.pluginId || 'builtin.basic',
      desc: opts.desc || '',
      createdAt: U.now(),
      options: opts.options || {}
    };
    state.decks.push(deck);
    persist('decks');
    return deck;
  }

  function updateDeck(id, patch) {
    var d = getDeck(id);
    if (!d) return null;
    Object.keys(patch).forEach(function (k) { d[k] = patch[k]; });
    persist('decks');
    return d;
  }

  function deleteDeck(id, withCards) {
    state.decks = state.decks.filter(function (d) { return d.id !== id; });
    if (withCards) state.cards = state.cards.filter(function (c) { return c.deckId !== id; });
    else state.cards.forEach(function (c) { if (c.deckId === id) c.deckId = ''; });
    persist('decks'); persist('cards');
  }

  /* ---------------- 卡片 ---------------- */
  function listCards(deckId) {
    if (!deckId) return state.cards.slice();
    return state.cards.filter(function (c) { return c.deckId === deckId; });
  }
  function getCard(id) { return state.cards.filter(function (c) { return c.id === id; })[0] || null; }

  /* 卡片的知识掌握等级 0-5。
     5 级 = 精通 = 休眠，不再被主动推给你复习，但仍可以在卡片库里手动唤醒。
     这个等级只做「反馈」，不参与间隔计算——调度永远是 SM-2 说了算。 */
  var MASTER_MAX = 5;
  var MATURE_DAYS = 21;   // 间隔拉到 21 天才算「成熟」，才允许升到 5 级
  var MAX_INTERVAL_DAYS = 3650;  // 复习间隔封顶 10 年，避免指数增长算出天文数字

  function newCardSched() {
    return {
      due: U.now(), interval: 0, ease: 2.5, reps: 0, lapses: 0, lastReviewed: 0, state: 'new',
      mastery: 0, sleeping: false
    };
  }

  function masteryOf(card) {
    return card && card.sched ? U.clamp(card.sched.mastery || 0, 0, MASTER_MAX) : 0;
  }
  function isSleeping(card) {
    return !!(card && card.sched && card.sched.sleeping);
  }

  /**
   * 按这次的评分升降掌握等级。
   *   重来 -2 / 困难 -1 / 良好 +1 / 简单 +2
   * 关键是那个 cap：间隔没到 MATURE_DAYS 时最高只能到 4 级。
   * 「5 级就休眠、不再推送」是个会影响复习覆盖面的决定，
   * 不能靠连点几下「简单」骗过去——必须由 SRS 自己的间隔来背书。
   */
  function applyMastery(sched, rating) {
    var before = U.clamp(sched.mastery || 0, 0, MASTER_MAX);
    var delta = rating === 0 ? -2 : rating === 1 ? -1 : rating === 2 ? 1 : 2;
    var iv = sched.interval || 0;
    var cap = iv >= MATURE_DAYS ? MASTER_MAX : MASTER_MAX - 1;
    var after = U.clamp(before + delta, 0, cap);
    sched.mastery = after;
    sched.sleeping = after >= MASTER_MAX;
    return { before: before, after: after, mastered: sched.sleeping && before < MASTER_MAX };
  }

  /** 手动唤醒一张休眠的卡：掉一级，重新靠复习赚回精通。 */
  function wakeCard(id) {
    var c = getCard(id);
    if (!c || !c.sched) return null;
    c.sched.sleeping = false;
    c.sched.mastery = Math.min(c.sched.mastery || 0, MASTER_MAX - 1);
    // 立刻回到队列：把 due 拉到当下，不用等原来的长间隔
    c.sched.due = U.now();
    c.sched.state = 'review';
    persist('cards');
    return c;
  }

  function createCard(deckId, pluginId, fields, tags) {
    var card = {
      id: U.uid('card'),
      deckId: deckId || '',
      pluginId: pluginId || 'builtin.basic',
      fields: fields || {},
      tags: tags || [],
      clozeIndex: fields && fields.__clozeIndex ? fields.__clozeIndex : 0,
      createdAt: U.now(),
      sched: newCardSched()
    };
    delete card.fields.__clozeIndex;
    state.cards.push(card);
    persist('cards');
    if (global.Game && global.Game.onCardsCreated) global.Game.onCardsCreated([card]);
    return card;
  }

  function createCardsBulk(list) {
    var out = [];
    list.forEach(function (item) {
      var card = {
        id: U.uid('card'),
        deckId: item.deckId || '',
        pluginId: item.pluginId || 'builtin.basic',
        fields: item.fields || {},
        tags: item.tags || [],
        clozeIndex: item.clozeIndex || 0,
        createdAt: U.now(),
        sched: newCardSched()
      };
      state.cards.push(card);
      out.push(card);
    });
    persist('cards');
    if (out.length && global.Game && global.Game.onCardsCreated) global.Game.onCardsCreated(out);
    return out;
  }

  function updateCard(id, patch) {
    var c = getCard(id);
    if (!c) return null;
    Object.keys(patch).forEach(function (k) {
      if (k === 'fields') {
        c.fields = Object.assign({}, c.fields, patch.fields);
      } else if (k === 'sched') {
        c.sched = Object.assign({}, c.sched, patch.sched);
      } else { c[k] = patch[k]; }
    });
    persist('cards');
    return c;
  }

  function deleteCard(id) {
    state.cards = state.cards.filter(function (c) { return c.id !== id; });
    persist('cards');
  }

  function deleteCards(ids) {
    var set = {};
    ids.forEach(function (i) { set[i] = 1; });
    state.cards = state.cards.filter(function (c) { return !set[c.id]; });
    persist('cards');
  }

  /* ---------------- SM-2 调度 ---------------- */
  // rating: 0=重来 1=困难 2=良好 3=简单
  function schedule(card, rating) {
    var s = card.sched || newCardSched();
    var ease = U.clamp(s.ease || 2.5, 1.3, 3.2);
    var interval = s.interval || 0;
    var lapses = s.lapses || 0;
    var dueAt;

    if (rating === 0) {
      lapses += 1;
      ease = U.clamp(ease - 0.2, 1.3, 3.2);
      interval = 0;
      dueAt = U.now() + 10 * 60 * 1000; // 10 分钟后重来
    } else {
      if (rating === 1) {
        ease = U.clamp(ease - 0.15, 1.3, 3.2);
        interval = interval < 1 ? 1 : Math.max(1, Math.round(interval * 1.2));
      } else if (rating === 2) {
        interval = interval < 1 ? 1 : Math.round(interval * ease);
      } else {
        ease = U.clamp(ease + 0.15, 1.3, 3.2);
        interval = interval < 1 ? 4 : Math.round(interval * ease * 1.3);
      }
      // 封顶：间隔是指数增长的，一路点「简单」会算出「2000 万天」这种天文数字，
      // 既没有意义，也会让 due 逼近时间戳的精度上限。10 年已经远超任何真实复习需求。
      if (interval > MAX_INTERVAL_DAYS) interval = MAX_INTERVAL_DAYS;
      dueAt = U.now() + interval * U.DAY;
    }

    card.sched = {
      due: dueAt,
      interval: interval,
      ease: Math.round(ease * 1000) / 1000,
      reps: (s.reps || 0) + 1,
      lapses: lapses,
      lastReviewed: U.now(),
      state: rating === 0 ? 'relearning' : (interval >= 21 ? 'review' : 'learning'),
      // 掌握等级跟着一起走：撤销评分时用 restoreSched 整体还原，等级也会一起回去
      mastery: U.clamp(s.mastery || 0, 0, MASTER_MAX),
      sleeping: !!s.sleeping
    };
    var mres = applyMastery(card.sched, rating);
    state.logs.push({ t: U.now(), cardId: card.id, deckId: card.deckId, rating: rating, interval: interval });
    if (state.logs.length > 20000) state.logs = state.logs.slice(-15000);
    persist('cards'); persist('logs');

    // 成长体系挂钩：只加经验/徽章/连续天数，绝不反过来改调度。
    if (global.Game) {
      if (mres.mastered && global.Game.onMastered) global.Game.onMastered(card.id);
      if (global.Game.onReview) global.Game.onReview(card, rating);
    }
    return card.sched;
  }

  /**
   * 把一张卡的调度状态整体还原成快照。
   * 用于「撤销上次评分」——schedule() 是就地改 card.sched 并且立刻落盘的，
   * 点错档位之后 interval/ease/lapses 都已经变了，只能靠还原快照回退。
   * 注意这里必须整体替换而不是 merge，否则快照里没有的键会残留下来。
   */
  function restoreSched(cardId, sched) {
    var c = getCard(cardId);
    if (!c) return null;
    c.sched = U.deepClone(sched);
    persist('cards');
    return c.sched;
  }

  /**
   * 难卡（leech）：答错次数累积到阈值的卡。
   * 一张卡被反复答错，几乎总是因为这张卡本身太胖/太含糊，
   * 而不是学习者不努力——所以要把它找出来提示拆分，而不是继续硬刷。
   */
  function leechCards(deckId, threshold) {
    var th = threshold || state.settings.study.leechThreshold || 4;
    return listCards(deckId).filter(function (c) {
      return !c.suspended && (c.sched.lapses || 0) >= th;
    }).sort(function (a, b) { return (b.sched.lapses || 0) - (a.sched.lapses || 0); });
  }

  function isLeech(card, threshold) {
    if (!card || !card.sched) return false;
    var th = threshold || state.settings.study.leechThreshold || 4;
    return !card.suspended && (card.sched.lapses || 0) >= th;
  }

  // 纯计算，不写库、不改状态：预览四个按钮分别会把卡片推到多久之后
  function previewIntervals(card) {
    var s = (card && card.sched) || newCardSched();
    var ease0 = U.clamp(s.ease || 2.5, 1.3, 3.2);
    var i0 = s.interval || 0;
    var out = [];
    for (var r = 0; r < 4; r++) {
      var ease = ease0, interval = i0;
      if (r === 0) { interval = 0; }
      else if (r === 1) { interval = interval < 1 ? 1 : Math.max(1, Math.round(interval * 1.2)); }
      else if (r === 2) { interval = interval < 1 ? 1 : Math.round(interval * ease); }
      else { interval = interval < 1 ? 4 : Math.round(interval * U.clamp(ease + 0.15, 1.3, 3.2) * 1.3); }
      out.push(interval);
    }
    return out;
  }

  function dueCards(deckId, limit) {
    var t = U.now();
    // 休眠（5 级精通）的卡不再主动推送 —— 这是「精通后不再打扰」的唯一实现点
    var pool = listCards(deckId).filter(function (c) { return !c.suspended && !isSleeping(c); });
    var learning = pool.filter(function (c) { return c.sched.reps > 0 && c.sched.due <= t; });
    var fresh = pool.filter(function (c) { return c.sched.reps === 0; });
    fresh.sort(function (a, b) { return a.createdAt - b.createdAt; });
    var newLimit = state.settings.study.newPerDay;
    var queue = learning.concat(fresh.slice(0, newLimit));
    if (limit) queue = queue.slice(0, limit);
    return queue;
  }

  function deckStats(deckId) {
    var t = U.now();
    var cards = listCards(deckId);
    var s = {
      total: cards.length, due: 0, fresh: 0, learning: 0, young: 0, mature: 0, suspended: 0,
      sleeping: 0, mastered: 0, mastery: [0, 0, 0, 0, 0, 0]
    };
    cards.forEach(function (c) {
      var m = masteryOf(c);
      s.mastery[m]++;
      if (m >= 5) s.mastered++;
      if (isSleeping(c)) s.sleeping++;
      if (c.suspended) { s.suspended++; return; }
      if (c.sched.reps === 0) s.fresh++;
      else if (c.sched.due <= t) s.due++;
      if (c.sched.reps > 0) {
        if (c.sched.interval >= 21) s.mature++; else s.young++;
      }
      if (c.sched.state === 'learning' || c.sched.state === 'relearning') s.learning++;
    });
    return s;
  }

  function globalStats() {
    var g = { total: 0, due: 0, fresh: 0, decks: state.decks.length, reviewedToday: 0 };
    state.decks.forEach(function (d) {
      var s = deckStats(d.id);
      g.total += s.total; g.due += s.due; g.fresh += s.fresh;
    });
    var today = U.startOfDay();
    g.reviewedToday = state.logs.filter(function (l) { return l.t >= today; }).length;
    return g;
  }

  /* ---------------- 设置 ---------------- */
  function getSettings() { return state.settings; }
  function saveSettings(patch) {
    state.settings = mergeDeep(state.settings, patch);
    persist('settings');
    return state.settings;
  }
  function resetSettings() {
    state.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    persist('settings');
    return state.settings;
  }

  /* ---------------- 导入 / 导出 ---------------- */
  /* ============================================================
   * 自动快照备份（IndexedDB 环形）
   *   这个工具的全部数据都在 localStorage 里，用户清一次浏览器数据
   *   或者换台机器就全没了，而「记得导出备份」从来没人做得到。
   *   所以每次启动悄悄存一份快照，出事了能回滚。
   *   快照体积是整个数据集的倍数，放 localStorage 会顶爆 5MB 配额，
   *   因此走 IndexedDB；没有 IDB 就整体降级成 no-op（不报错、不影响使用）。
   * ============================================================ */
  var IDB_NAME = 'flashcards';
  var IDB_STORE = 'snapshots';
  var SNAP_KEEP = 10;
  var SNAP_MIN_GAP = 60 * 60 * 1000; // 同一小时内不重复存，避免每次刷新都写一份

  function snapUnsupported() {
    return !(U.idb && U.idb.available());
  }

  function snapOpen() {
    return U.idb.open(IDB_NAME, IDB_STORE, 1);
  }

  /** 存一份快照。返回 Promise<string|null>（null = 不支持或跳过）。 */
  function snapshotSave(reason, force) {
    if (snapUnsupported()) return Promise.resolve(null);
    var last = 0;
    try { last = parseInt(U.Store.get('lastSnapshotAt', 0), 10) || 0; } catch (e) { last = 0; }
    if (!force && U.now() - last < SNAP_MIN_GAP) return Promise.resolve(null);

    var rec = {
      id: 'snap-' + U.now() + '-' + Math.random().toString(36).slice(2, 8),
      t: U.now(),
      reason: reason || 'auto',
      counts: { decks: state.decks.length, cards: state.cards.length },
      data: exportAll()
    };
    return snapOpen().then(function (db) {
      return U.idb.tx(db, IDB_STORE, 'readwrite', function (st) { return st.put(rec); })
        .then(function () { return snapshotPrune(db); })
        .then(function () { db.close(); })
        .then(function () {
          U.Store.set('lastSnapshotAt', U.now());
          return rec.id;
        });
    }).catch(function () { return null; }); // 存快照失败绝不能影响正常使用
  }

  /** 只保留最近 keep 份。db 可传入以复用连接。 */
  function snapshotPrune(db) {
    var keep = SNAP_KEEP;
    function run(d) {
      return U.idb.tx(d, IDB_STORE, 'readonly', function (st) { return st.getAll(); })
        .then(function (all) {
          var list = (all || []).slice().sort(function (a, b) { return b.t - a.t; });
          var dead = list.slice(keep);
          if (!dead.length) return 0;
          return U.idb.tx(d, IDB_STORE, 'readwrite', function (st) {
            dead.forEach(function (r) { st.delete(r.id); });
            return dead.length;
          });
        });
    }
    if (db) return run(db);
    return snapOpen().then(function (d) {
      return run(d).then(function (n) { d.close(); return n; });
    });
  }

  /** 列出快照元信息（不含 data），新的在前。 */
  function snapshotList() {
    if (snapUnsupported()) return Promise.resolve([]);
    return snapOpen().then(function (db) {
      return U.idb.tx(db, IDB_STORE, 'readonly', function (st) { return st.getAll(); })
        .then(function (all) {
          db.close();
          return (all || []).map(function (r) {
            return { id: r.id, t: r.t, reason: r.reason, counts: r.counts || {} };
          }).sort(function (a, b) { return b.t - a.t; });
        });
    }).catch(function () { return []; });
  }

  /** 用某份快照整体覆盖当前数据。 */
  function snapshotRestore(id) {
    if (snapUnsupported()) return Promise.reject(new Error('这台设备不支持本地快照（IndexedDB 不可用）'));
    return snapOpen().then(function (db) {
      return U.idb.tx(db, IDB_STORE, 'readonly', function (st) { return st.get(id); })
        .then(function (rec) {
          db.close();
          if (!rec || !rec.data) throw new Error('找不到这份快照');
          importAll(rec.data, 'replace');
          U.Store.del('lastSnapshotAt');
          return { t: rec.t, counts: rec.counts || {} };
        });
    });
  }

  function snapshotClear() {
    if (snapUnsupported()) return Promise.resolve(0);
    return snapOpen().then(function (db) {
      return U.idb.tx(db, IDB_STORE, 'readwrite', function (st) { return st.clear(); })
        .then(function () { db.close(); U.Store.del('lastSnapshotAt'); return 1; });
    }).catch(function () { return 0; });
  }

  // 启动时调用：按节流策略存一份
  function snapshotOnBoot() {
    return snapshotSave('启动自动备份');
  }

  function exportAll() {
    return {
      format: 'flashcards-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      decks: state.decks,
      cards: state.cards,
      settings: state.settings,
      plugins: U.Store.get(KEYS.plugins, []),
      // 角色成长 + 每日流水。卡片掌握度本来就在 cards[].sched 里，不用再带一份。
      // Game 没加载时（比如某些自检场景）就跳过，不影响备份本身。
      growth: global.Game ? global.Game.exportJSON({ includeCards: false }) : undefined
    };
  }

  function importAll(data, mode) {
    // mode: 'merge' | 'replace'
    if (!data || data.format !== 'flashcards-backup') throw new Error('不是有效的备份文件（缺少 format 字段）');
    if (mode === 'replace') {
      state.decks = data.decks || [];
      state.cards = data.cards || [];
      if (data.settings) state.settings = mergeDeep(DEFAULT_SETTINGS, data.settings);
    } else {
      var deckIdMap = {};
      (data.decks || []).forEach(function (d) {
        var nd = U.deepClone(d);
        var old = nd.id;
        if (getDeck(nd.id)) { nd.id = U.uid('deck'); nd.name = nd.name + ' (导入)'; }
        deckIdMap[old] = nd.id;
        state.decks.push(nd);
      });
      (data.cards || []).forEach(function (c) {
        var nc = U.deepClone(c);
        nc.id = U.uid('card');
        nc.deckId = deckIdMap[nc.deckId] !== undefined ? deckIdMap[nc.deckId] : nc.deckId;
        state.cards.push(nc);
      });
    }
    persist('decks'); persist('cards'); persist('settings');
    // 成长数据并进来。merge 模式下经验取两边较大值、徽章取并集——
    // 从不在合并时把对方的等级调低，这是这个体系「只加不减」的一部分。
    if (data.growth && global.Game) {
      try { global.Game.importJSON(data.growth, mode === 'replace' ? 'replace' : 'merge'); }
      catch (e) { /* 成长数据坏了不该让整份备份导入失败 */ }
    }
    return { decks: state.decks.length, cards: state.cards.length };
  }

  function exportDeck(deckId) {
    var d = getDeck(deckId);
    return {
      format: 'flashcards-deck',
      version: 1,
      exportedAt: new Date().toISOString(),
      deck: d,
      cards: listCards(deckId).map(function (c) {
        return { pluginId: c.pluginId, fields: c.fields, tags: c.tags, clozeIndex: c.clozeIndex, sched: c.sched };
      })
    };
  }

  function clearAll() {
    state.decks = []; state.cards = []; state.logs = [];
    persist('decks'); persist('cards'); persist('logs');
  }

  global.DB = {
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    get state() { return state; },
    listDecks: listDecks, getDeck: getDeck, createDeck: createDeck, updateDeck: updateDeck, deleteDeck: deleteDeck,
    listCards: listCards, getCard: getCard, createCard: createCard, createCardsBulk: createCardsBulk,
    updateCard: updateCard, deleteCard: deleteCard, deleteCards: deleteCards,
    newCardSched: newCardSched, schedule: schedule, previewIntervals: previewIntervals,
    restoreSched: restoreSched, leechCards: leechCards, isLeech: isLeech,
    masteryOf: masteryOf, isSleeping: isSleeping, wakeCard: wakeCard, applyMastery: applyMastery,
    MASTER_MAX: MASTER_MAX, MATURE_DAYS: MATURE_DAYS, MAX_INTERVAL_DAYS: MAX_INTERVAL_DAYS,
    dueCards: dueCards, deckStats: deckStats, globalStats: globalStats,
    getSettings: getSettings, saveSettings: saveSettings, resetSettings: resetSettings,
    exportAll: exportAll, importAll: importAll, exportDeck: exportDeck, clearAll: clearAll,
    snapshotSave: snapshotSave, snapshotList: snapshotList, snapshotRestore: snapshotRestore,
    snapshotClear: snapshotClear, snapshotPrune: snapshotPrune, snapshotOnBoot: snapshotOnBoot,
    snapshotSupported: function () { return !snapUnsupported(); },
    persist: persist
  };
})(window);
