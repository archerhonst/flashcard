/* ============================================================
 * lang/en.js —— English dictionary
 *
 * 键就是中文原文（见 js/i18n.js 顶部的理由）。
 * 只写**英文**这一份；中文不建词典，查不到就直接用原文。
 *
 * 注意：
 *   · 值里必须原样保留 HTML 标签、属性、`{n}` 占位符和 `\n` 转义。
 *   · 纯 emoji、纯 HTML 结构、本来就没有中文的键**不用列**（回落即原样）。
 *   · staticcheck 会检查每一个字面量 T('...') 都在这里有对应条目，
 *     所以漏翻会在自检时直接报错，不会静默漏到用户面前。
 * ============================================================ */
(function (global) {
  'use strict';
  global.I18n.register('en', {

    /* ---------------- 导航 / 顶栏 ---------------- */
    '先建一个牌组': 'Create a deck first',
    '牌组名称': 'Deck name',
    '我的牌组': 'My deck',
    '例如：考研英语核心词': 'e.g. TOEFL core vocabulary',
    '卡片类型': 'Card type',
    '学习': 'Study',
    '卡片': 'Cards',
    '挖空 / AI': 'Cloze / AI',
    '插件': 'Plugins',
    '设置': 'Settings',
    '<nav class="tabbar" aria-label="主导航">': '<nav class="tabbar" aria-label="Main navigation">',
    '闪卡': 'FlashCards',
    '还没有牌组': 'No decks yet',
    '卡片库': 'Card library',
    ' 个牌组 · {n} 张卡 · 今日已复习 ': ' decks · {n} cards · reviewed today ',
    '<button class="btn btn--icon" data-act="deck:new" title="新建牌组">＋</button>':
      '<button class="btn btn--icon" data-act="deck:new" title="New deck">＋</button>',
    '挖空 & AI': 'Cloze & AI',
    '人工挖空 · 智能挖空 · AI 生成': 'Manual cloze · Smart cloze · AI generate',
    'JSON 插件': 'JSON plugins',
    ' 个已启用': ' enabled',
    '<button class="btn btn--icon" data-act="pl:new" title="新建插件">＋</button>':
      '<button class="btn btn--icon" data-act="pl:new" title="New plugin">＋</button>',
    'AI 接口 · 数据备份 · 外观': 'AI · Backup · Appearance',
    '<button class="btn btn--sm btn--primary" data-act="deck:new">新建牌组</button>':
      '<button class="btn btn--sm btn--primary" data-act="deck:new">New deck</button>',
    '没有可以撤销的评分了': 'Nothing left to undo',
    '已撤销上一次评分': 'Last rating undone',

    /* ---------------- 学习页 ---------------- */
    '这张卡没有挖空': 'This card has no blanks',
    '全对 ✓': 'All correct ✓',
    ' 个空没答对，看看正确答案': " blanks were wrong — check the answers",
    '<div class="empty"><span class="empty-ico">🗂️</span>还没有牌组<br>':
      '<div class="empty"><span class="empty-ico">🗂️</span>No decks yet<br>',
    '<button class="btn btn--primary" style="margin-top:14px" data-act="deck:new">创建第一个牌组</button></div>':
      '<button class="btn btn--primary" style="margin-top:14px" data-act="deck:new">Create your first deck</button></div>',
    '<b style="color:var(--fg)">这个牌组今天已经清空了</b><br>':
      '<b style="color:var(--fg)">This deck is done for today</b><br>',
    '待复习 ': 'Due ',
    ' · 新卡 {n} · 总计 ': ' · new {n} · total ',
    '<button class="btn" style="margin-top:14px" data-act="study:reload">刷新队列</button> ':
      '<button class="btn" style="margin-top:14px" data-act="study:reload">Refresh queue</button> ',
    '<button class="btn" style="margin-top:14px" data-act="deck:addCard">加张卡</button> ':
      '<button class="btn" style="margin-top:14px" data-act="deck:addCard">Add a card</button> ',
    '<button class="btn btn--ghost" style="margin-top:14px" data-act="study:undo">↩ 撤销上一次评分</button>':
      '<button class="btn btn--ghost" style="margin-top:14px" data-act="study:undo">↩ Undo last rating</button>',
    '重来': 'Again',
    '困难': 'Hard',
    '良好': 'Good',
    '简单': 'Easy',
    '<div class="leech-banner">🩸 <b>难卡</b>：已经答错 ':
      '<div class="leech-banner">🩸 <b>Leech</b>: wrong ',
    ' 次了。多半不是记不住，而是这张卡太胖——':
      ' times. It is probably not your memory — this card is too fat —',
    '">✂️ 让 AI 拆开</button></div>': '">✂️ Split it with AI</button></div>',
    '<div class="flip-tip">在空里打字，然后按 <span class="kbd">回车</span> 检查':
      '<div class="flip-tip">Type in the blanks, then press <span class="kbd">Enter</span> to check',
    '（实在想不起来可以直接按 <span class="kbd">空格</span> 看答案）':
      '(or press <span class="kbd">Space</span> to reveal the answer)',
    '<button class="btn btn--primary btn--block" style="margin-top:12px;padding:13px" data-act="study:check">检查</button>':
      '<button class="btn btn--primary btn--block" style="margin-top:12px;padding:13px" data-act="study:check">Check</button>',
    '<button class="btn btn--block btn--ghost" style="margin-top:8px" data-act="study:reveal">想不起来，直接看答案</button>':
      '<button class="btn btn--block btn--ghost" style="margin-top:8px" data-act="study:reveal">Can’t recall — show the answer</button>',
    '<div class="flip-tip">点击卡片或按 <span class="kbd">空格</span> 显示答案</div>':
      '<div class="flip-tip">Tap the card or press <span class="kbd">Space</span> to reveal</div>',
    '<button class="btn btn--primary btn--block" style="margin-top:12px;padding:13px" data-act="study:reveal">显示答案</button>':
      '<button class="btn btn--primary btn--block" style="margin-top:12px;padding:13px" data-act="study:reveal">Show answer</button>',
    '">✏️ 编辑</button>': '">✏️ Edit</button>',
    '">⏸ 暂停</button>': '">⏸ Suspend</button>',
    '">🗑 删除</button>': '">🗑 Delete</button>',
    '<button class="btn btn--sm btn--ghost" data-act="study:undo">↩ 撤销评分</button>':
      '<button class="btn btn--sm btn--ghost" data-act="study:undo">↩ Undo</button>',
    '<span class="muted">本轮 完成 ': '<span class="muted">Round: ',
    ' · 重来 ': ' · again ',
    '10 分钟': '10 min',
    ' 小时': ' h',
    ' 天': ' days',
    ' 天#1': ' day',
    ' 月': ' mo',
    ' 年': ' y',
    '本轮完成！共 {n} 次': 'Round complete — {n} reviews',
    '<span>{n} 张剩余</span>': '<span>{n} left</span>',

    /* ---------------- 卡片库 / 牌组 ---------------- */
    '</b><span>总卡片</span></div>': '</b><span>Total cards</span></div>',
    '</b><span>待复习</span></div>': '</b><span>Due</span></div>',
    '</b><span>新卡</span></div>': '</b><span>New</span></div>',
    '</b><span>今日复习</span></div>': '</b><span>Reviewed today</span></div>',
    '<div class="empty"><span class="empty-ico">📭</span>还没有牌组<br>':
      '<div class="empty"><span class="empty-ico">📭</span>No decks yet<br>',
    '<button class="btn btn--primary" style="margin-top:14px" data-act="deck:new">新建牌组</button> ':
      '<button class="btn btn--primary" style="margin-top:14px" data-act="deck:new">New deck</button> ',
    '<button class="btn" style="margin-top:14px" data-act="data:import">导入备份</button></div>':
      '<button class="btn" style="margin-top:14px" data-act="data:import">Import backup</button></div>',
    ' 待复习</b>': ' due</b>',
    ' 新卡</i>': ' new</i>',
    '<span>共 ': '<span>Total ',
    '<button class="btn btn--sm btn--ghost" data-act="deck:back">‹ 返回</button>':
      '<button class="btn btn--sm btn--ghost" data-act="deck:back">‹ Back</button>',
    '">🤖 AI 生成</button>': '">🤖 AI generate</button>',
    '">📥 批量导入</button>': '">📥 Bulk import</button>',
    '<div class="item-sub" style="gap:12px"><span>共 ': '<div class="item-sub" style="gap:12px"><span>Total ',
    ' 新卡</i><span>熟练 ': ' new</i><span>Mature ',
    '">＋ 新卡</button>': '">＋ New card</button>',
    '">牌组设置</button>': '">Deck settings</button>',
    '">导出</button>': '">Export</button>',
    '">删除牌组</button>': '">Delete deck</button>',
    '<input type="search" id="card-search" placeholder="搜索卡片内容或标签…" value="':
      '<input type="search" id="card-search" placeholder="Search cards or tags…" value="',
    '没有匹配的卡片': 'No matching cards',
    '这个牌组还是空的': 'This deck is still empty',
    '新卡': 'New',
    '下次 ': 'Next ',
    '<span>复习 ': '<span>Reviewed ',
    ' 次</span>': ' times</span>',
    '<div class="muted" style="text-align:center;padding:12px">只显示前 300 张，请用搜索缩小范围</div>':
      '<div class="muted" style="text-align:center;padding:12px">Showing the first 300 — search to narrow down</div>',
    '请先创建牌组': 'Create a deck first',

    /* ---------------- 卡片编辑器 ---------------- */
    '<label class="field"><span>卡片类型</span><select data-field="__plugin">':
      '<label class="field"><span>Card type</span><select data-field="__plugin">',
    '<label class="field"><span>标签（逗号分隔）</span><input type="text" data-field="__tags" value="':
      '<label class="field"><span>Tags (comma separated)</span><input type="text" data-field="__tags" value="',
    '<button class="btn btn--danger" data-act="m:del">删除</button>':
      '<button class="btn btn--danger" data-act="m:del">Delete</button>',
    '<button class="btn btn--ghost" data-act="m:close">取消</button>':
      '<button class="btn btn--ghost" data-act="m:close">Cancel</button>',
    '<button class="btn btn--primary" data-act="m:save">保存</button>':
      '<button class="btn btn--primary" data-act="m:save">Save</button>',
    '编辑卡片': 'Edit card',
    '新建卡片': 'New card',
    '删除卡片': 'Delete card',
    '删除后不可恢复，确定吗？': 'This cannot be undone. Continue?',
    '删除': 'Delete',
    '已删除': 'Deleted',
    '请填写：': 'Required: ',
    '、': ', ',
    '已保存': 'Saved',
    '已生成 {n} 张卡片': '{n} cards created',
    '每行一个': 'one per line',
    '><span class="track"></span><span>启用</span></label>':
      '><span class="track"></span><span>Enabled</span></label>',

    /* ---------------- 挖空 / AI 页 ---------------- */
    '<div class="card-panel"><div class="section-title">目标牌组':
      '<div class="card-panel"><div class="section-title">Target deck',
    '<button class="btn btn--sm btn--ghost" data-act="deck:new">＋新建</button></div>':
      '<button class="btn btn--sm btn--ghost" data-act="deck:new">＋ New</button></div>',
    '<div class="muted">还没有牌组，先新建一个（挖空卡建议选「🕳️ 挖空（Cloze）」类型）。</div>':
      '<div class="muted">No decks yet — create one (for cloze cards pick the “🕳️ Cloze” type).</div>',
    '<div class="card-panel"><div class="section-title">挖空工作台</div>':
      '<div class="card-panel"><div class="section-title">Cloze workbench</div>',
    '<textarea class="cloze-src" id="cz-src" placeholder="把要背的材料粘进来，然后：\n· 选中文字点「挖空选中」\n· 或打开「点词挖空」直接戳词\n· 或点「智能挖空」自动出空">':
      '<textarea class="cloze-src" id="cz-src" placeholder="Paste the material you want to memorize, then:\n· select text and tap “Cloze selection”\n· or turn on “Tap words” and tap a word\n· or tap “Smart cloze” to auto-pick blanks">',
    '" data-act="cz:mode" data-v="edit">✍️ 文本编辑</button>': '" data-act="cz:mode" data-v="edit">✍️ Edit text</button>',
    '" data-act="cz:mode" data-v="tap">👆 点词挖空</button>': '" data-act="cz:mode" data-v="tap">👆 Tap words</button>',
    '<button class="btn btn--sm" data-act="cz:wrap">挖空选中</button>':
      '<button class="btn btn--sm" data-act="cz:wrap">Cloze selection</button>',
    '<button class="btn btn--sm" data-act="cz:unwrap">取消选中挖空</button>':
      '<button class="btn btn--sm" data-act="cz:unwrap">Remove cloze</button>',
    '<button class="btn btn--sm btn--ghost" data-act="cz:clear">清空</button>':
      '<button class="btn btn--sm btn--ghost" data-act="cz:clear">Clear</button>',
    '<span class="muted">自动挖空数量</span>': '<span class="muted">Blanks to create</span>',
    '" data-act="cz:engine" data-v="local">⚡ 本地智能挖空</button>': '" data-act="cz:engine" data-v="local">⚡ Local smart cloze</button>',
    '" data-act="cz:engine" data-v="ai">🤖 AI 挖空</button>': '" data-act="cz:engine" data-v="ai">🤖 AI cloze</button>',
    '<span class="spin"></span> 生成中…': '<span class="spin"></span> Generating…',
    '🤖 用 AI 生成挖空': '🤖 Generate with AI',
    '⚡ 本地智能挖空': '⚡ Local smart cloze',
    '<div class="muted">👆 点击下面的词即可挖空 / 取消挖空</div>':
      '<div class="muted">👆 Tap a word below to toggle a blank</div>',
    '<div class="muted">预览</div>': '<div class="muted">Preview</div>',
    '<span class="muted">还没有挖空</span>': '<span class="muted">No blanks yet</span>',
    '<label class="field" style="margin:0"><span>补充说明（选填）</span>':
      '<label class="field" style="margin:0"><span>Extra note (optional)</span>',
    '<textarea id="cz-extra" style="min-height:56px" placeholder="显示在答案下方">':
      '<textarea id="cz-extra" style="min-height:56px" placeholder="Shown under the answer">',
    '><span class="track"></span><span>每个空单独一张卡（关掉则整段一张卡）</span></label>':
      '><span class="track"></span><span>One card per blank (off = one card for the whole text)</span></label>',
    '<button class="btn btn--primary btn--block" data-act="cz:save" style="padding:12px">💾 保存到牌组</button>':
      '<button class="btn btn--primary btn--block" data-act="cz:save" style="padding:12px">💾 Save to deck</button>',
    '<div class="card-panel"><div class="section-title">🤖 AI 拆卡（整段材料 → 多张卡）</div>':
      '<div class="card-panel"><div class="section-title">🤖 AI splitting (passage → many cards)</div>',
    '<div class="muted" style="margin-bottom:8px">使用目标牌组的卡型模板与提示词。':
      '<div class="muted" style="margin-bottom:8px">Uses the target deck’s card type and prompt. ',
    '<a href="#" data-act="nav" data-v="plugins" style="color:var(--primary)">去插件页</a> 可以自定义提示词。</div>':
      '<a href="#" data-act="nav" data-v="plugins" style="color:var(--primary)">Plugins page</a> to customize the prompt.</div>',
    '<label class="field"><span>材料</span><textarea id="ai-text" placeholder="粘贴文章 / 笔记 / 教材段落…" style="min-height:110px"></textarea></label>':
      '<label class="field"><span>Material</span><textarea id="ai-text" placeholder="Paste an article / notes / textbook passage…" style="min-height:110px"></textarea></label>',
    '<div class="row row--between"><span class="muted">卡片数量</span>':
      '<div class="row row--between"><span class="muted">Number of cards</span>',
    '" data-act="cz:engine" data-v="local">⚡ 本地</button>': '" data-act="cz:engine" data-v="local">⚡ Local</button>',
    '" data-act="cz:engine" data-v="ai">🤖 AI</button>': '" data-act="cz:engine" data-v="ai">🤖 AI</button>',
    '✨ 生成卡片': '✨ Generate cards',
    '先在文本框里选中一段文字': 'Select some text in the box first',
    '选区落在挖空标记内部，换个位置': 'The selection is inside a blank marker — try another spot',
    '选区内没有挖空标记': 'No cloze marker inside the selection',
    '已取消 {n} 处挖空': 'Removed {n} blanks',
    '先粘贴一些材料': 'Paste some material first',
    '没找到合适的挖空候选，换个更长的材料试试': 'No good blank candidates — try longer material',
    '本地挖空完成：{n} 个空': 'Local cloze done: {n} blanks',
    'AI 失败，已用本地兜底：': 'AI failed, fell back to local: ',
    'AI 挖空完成': 'AI cloze done',
    '先粘贴材料': 'Paste material first',
    '请先选择目标牌组': 'Pick a target deck first',
    'AI 不可用，已用本地规则生成（效果有限）': 'AI unavailable — used local rules instead (limited quality)',
    '生成 {n} 张卡片，已存入「': '{n} cards created in “',
    '」': '”',

    /* ---------------- 插件页 ---------------- */
    '<div class="card-panel"><div class="section-title">安装 JSON 插件</div>':
      '<div class="card-panel"><div class="section-title">Install a JSON plugin</div>',
    '<div class="muted" style="margin-bottom:8px">插件就是一个 .json 文件，声明字段、模板和 AI 提示词。':
      '<div class="muted" style="margin-bottom:8px">A plugin is a .json file declaring fields, templates and an AI prompt. ',
    '<a href="#" data-act="pl:doc" style="color:var(--primary)">查看开发文档</a></div>':
      '<a href="#" data-act="pl:doc" style="color:var(--primary)">Developer docs</a></div>',
    '<button class="btn btn--sm" data-act="pl:fromFile">📂 选择 .json 文件</button>':
      '<button class="btn btn--sm" data-act="pl:fromFile">📂 Choose a .json file</button>',
    '<button class="btn btn--sm" data-act="pl:new">✏️ 手动编写</button>':
      '<button class="btn btn--sm" data-act="pl:new">✏️ Write one manually</button>',
    '<button class="btn btn--sm" data-act="pl:fromUrl">🌐 从网址安装</button>':
      '<button class="btn btn--sm" data-act="pl:fromUrl">🌐 Install from URL</button>',
    '<textarea id="pl-paste" class="code-area" style="min-height:130px" placeholder=\'粘贴插件 JSON，例如：\n{\n  "id": "my.deck",\n  "name": "我的卡型",\n  "apiVersion": 1,\n  "fields": [...],\n  "templates": { "front": "...", "back": "..." }\n}\'></textarea>':
      '<textarea id="pl-paste" class="code-area" style="min-height:130px" placeholder=\'Paste plugin JSON, for example:\n{\n  "id": "my.deck",\n  "name": "My card type",\n  "apiVersion": 1,\n  "fields": [...],\n  "templates": { "front": "...", "back": "..." }\n}\'></textarea>',
    '><span class="track"></span><span>覆盖同 id 的已有插件</span></label>':
      '><span class="track"></span><span>Overwrite a plugin with the same id</span></label>',
    '<button class="btn btn--primary btn--block" data-act="pl:install">安装</button>':
      '<button class="btn btn--primary btn--block" data-act="pl:install">Install</button>',
    '<div class="card-panel"><div class="section-title">内置示例插件':
      '<div class="card-panel"><div class="section-title">Built-in example plugins',
    '收起': 'Collapse',
    '加载': 'Load',
    '<div class="muted">正在读取 plugins/index.json …</div>':
      '<div class="muted">Reading plugins/index.json …</div>',
    '<div class="msg msg--warn">读不到内置示例（':
      '<div class="msg msg--warn">Cannot read the built-in examples (',
    '未知原因': 'unknown reason',
    '）。': ').',
    '直接开 index.html 时浏览器会拦下这个读取，改用本地服务器打开即可；':
      'Browsers block this read when you open index.html directly — serve it from a local server instead; ',
    '也可以在仓库里手动打开 <span class="mono">plugins/</span> 目录复制 JSON。</div>':
      'or open the <span class="mono">plugins/</span> folder and copy the JSON manually.</div>',
    '<div class="muted" style="margin-bottom:8px">下面是随 App 一起打包的示例卡型，点「安装」即可加入。</div>':
      '<div class="muted" style="margin-bottom:8px">These example card types ship with the app — tap “Install” to add one.</div>',
    '重新安装': 'Reinstall',
    '安装': 'Install',
    '<div class="msg msg--err"><b>✕ 校验失败</b><br>':
      '<div class="msg msg--err"><b>✕ Validation failed</b><br>',
    '<div class="msg msg--warn"><b>⚠ 提示</b><br>':
      '<div class="msg msg--warn"><b>⚠ Warnings</b><br>',
    '<div class="msg msg--ok">✓ 安装成功：': '<div class="msg msg--ok">✓ Installed: ',
    '<div class="section-title">已安装（': '<div class="section-title">Installed (',
    '）</div>': ')</div>',
    ' <span class="chip" style="font-size:.62rem">内置</span>':
      ' <span class="chip" style="font-size:.62rem">built-in</span>',
    ' <span class="chip" style="font-size:.62rem;color:var(--fg-3)">已停用</span>':
      ' <span class="chip" style="font-size:.62rem;color:var(--fg-3)">disabled</span>',
    ' 字段</span><span>模式 ': ' fields</span><span>mode ',
    '">预览</button>': '">Preview</button>',
    '">查看/编辑 JSON</button>': '">View / edit JSON</button>',
    '停用': 'Disable',
    '启用': 'Enable',
    '【{n} 示例】': '[{n} sample]',
    ' 这是正面内容': ' front content',
    ' 这是背面内容': ' back content',
    '<div class="card-panel"><div class="section-title">预览 · ': '<div class="card-panel"><div class="section-title">Preview · ',
    '<button class="btn btn--sm btn--ghost" data-act="pl:preview-close">关闭</button></div>':
      '<button class="btn btn--sm btn--ghost" data-act="pl:preview-close">Close</button></div>',
    '<div class="muted" style="margin-bottom:6px">正面</div>':
      '<div class="muted" style="margin-bottom:6px">Front</div>',
    '<div class="muted" style="margin:10px 0 6px">背面</div>':
      '<div class="muted" style="margin:10px 0 6px">Back</div>',
    '<button class="btn btn--ghost" data-act="m:validate">校验</button>':
      '<button class="btn btn--ghost" data-act="m:validate">Validate</button>',
    '保存': 'Save',
    '新建插件': 'New plugin',
    '编辑插件 · ': 'Edit plugin · ',
    '<div class="msg msg--err">JSON 语法错误：': '<div class="msg msg--err">JSON syntax error: ',
    '<div class="msg msg--err"><b>✕ 有 ': '<div class="msg msg--err"><b>✕ ',
    ' 处错误</b><br>': ' errors</b><br>',
    '<div class="msg msg--ok">✓ 校验通过</div>': '<div class="msg msg--ok">✓ Validation passed</div>',
    '请先修复错误': 'Fix the errors first',
    '插件已': 'Plugin ',

    /* ---------------- SAMPLE_PLUGIN（编辑器的起始 JSON，注意别改坏语法） ---------------- */
    '  "name": "我的卡型",': '  "name": "My card type",',
    '  "description": "一句话说明这个卡型是干什么的",':
      '  "description": "One line describing what this card type is for",',
    '    { "key": "q", "label": "问题", "type": "textarea", "required": true },':
      '    { "key": "q", "label": "Question", "type": "textarea", "required": true },',
    '    { "key": "a", "label": "答案", "type": "textarea", "required": true },':
      '    { "key": "a", "label": "Answer", "type": "textarea", "required": true },',
    '    { "key": "tip", "label": "记忆技巧", "type": "text" }':
      '    { "key": "tip", "label": "Memory tip", "type": "text" }',

    /* ---------------- 设置页 ---------------- */
    '<div class="card-panel"><div class="section-title">🤖 AI 接口（OpenAI 兼容）</div>':
      '<div class="card-panel"><div class="section-title">🤖 AI endpoint (OpenAI compatible)</div>',
    '<label class="field"><span>API 地址 (Base URL)</span>':
      '<label class="field"><span>API base URL</span>',
    '<label class="field"><span>模型名</span>': '<label class="field"><span>Model</span>',
    '><span class="track"></span><span>请求 JSON 输出模式（部分服务不支持，勾掉即可）</span></label>':
      '><span class="track"></span><span>Request JSON output (uncheck if your service does not support it)</span></label>',
    '<button class="btn btn--sm" data-act="set:test">🔌 测试连接</button>':
      '<button class="btn btn--sm" data-act="set:test">🔌 Test connection</button>',
    '<button class="btn btn--sm btn--ghost" data-act="set:preset" data-v="ollama">Ollama 本地</button>':
      '<button class="btn btn--sm btn--ghost" data-act="set:preset" data-v="ollama">Local Ollama</button>',
    '<div class="muted" style="margin-top:8px">⚠ 在浏览器里直接打开时，请求第三方 API 属于跨源请求，':
      '<div class="muted" style="margin-top:8px">⚠ Opened directly in a browser, calls to a third-party API are cross-origin requests ',
    '服务端不返回 CORS 头就会报「Failed to fetch」（用 Ollama 本地跑一般没这个问题）。':
      'and fail with “Failed to fetch” unless the server sends CORS headers (a local Ollama is usually fine). ',
    '封成 APK 后走的是原生代发请求，不受同源策略限制。</div>':
      'In the APK the request is sent natively instead, so the same-origin policy does not apply.</div>',
    '<div class="card-panel"><div class="section-title">📖 学习</div>':
      '<div class="card-panel"><div class="section-title">📖 Study</div>',
    '<div class="row row--between" style="margin-bottom:10px"><span>每天新卡上限</span>':
      '<div class="row row--between" style="margin-bottom:10px"><span>New cards per day</span>',
    '<div class="row row--between" style="margin-bottom:14px"><span>每天复习上限</span>':
      '<div class="row row--between" style="margin-bottom:14px"><span>Reviews per day</span>',
    '><span class="track"></span><span>打字作答（挖空卡在空里打字，自动判分）</span></label>':
      '><span class="track"></span><span>Typing mode (type into the blanks, auto-graded)</span></label>',
    '<div class="muted" style="margin:-2px 0 12px">比「心里想完再点显示答案」更接近真实回忆。判分会忽略大小写、全角半角、首尾标点；':
      '<div class="muted" style="margin:-2px 0 12px">Closer to real recall than thinking it through and tapping reveal. Grading ignores case, full/half-width and edge punctuation; ',
    '一个空写多个可接受答案用 <span class="mono">|</span> 隔开，例如 <span class="mono">{{c1::细胞|细胞质}}</span>。</div>':
      'separate several acceptable answers with <span class="mono">|</span>, e.g. <span class="mono">{{c1::cell|cytoplasm}}</span>.</div>',
    '<div class="row row--between"><span>难卡阈值（答错几次算难卡）</span>':
      '<div class="row row--between"><span>Leech threshold (wrong answers before a card is a leech)</span>',
    '<div class="card-panel"><div class="section-title">🎨 外观</div>':
      '<div class="card-panel"><div class="section-title">🎨 Appearance</div>',
    'auto:跟随系统': 'auto:Follow system',
    'dark:深色': 'dark:Dark',
    'light:浅色': 'light:Light',
    '<div class="row row--between" style="margin-top:12px"><span>正文字号</span>':
      '<div class="row row--between" style="margin-top:12px"><span>Font size</span>',
    '<div class="row row--between" style="margin-top:10px"><span>卡片最大宽度</span>':
      '<div class="row row--between" style="margin-top:10px"><span>Max card width</span>',
    '<div class="section-title" style="margin:16px 0 8px;font-size:13px">自定义 CSS</div>':
      '<div class="section-title" style="margin:16px 0 8px;font-size:13px">Custom CSS</div>',
    '界面语言': 'Language',
    // util.js 的通用文案（确认框按钮、相对时间、存储报错）
    '取消': 'Cancel',
    '确定': 'OK',
    '待复习': 'Due',
    ' 分钟后': ' min',
    ' 小时后': ' h',
    ' 天后': ' d',
    ' 个月后': ' mo',
    ' 年后': ' yr',
    '很久以后': 'a very long time from now',
    '本地存储写入失败：': 'Failed to write to local storage: ',
    '在这里写的样式会作用到整个 App（不只是某张卡）。适合改配色、字号、间距。':
      'CSS written here applies to the whole app, not just one card. Good for colors, font size and spacing.',
    '可用变量见 <code>app.css</code> 的 <code>:root</code>：':
      'Available variables live in <code>:root</code> of <code>app.css</code>: ',
    '<code>--radius</code> <code>--card-w</code> <code>--fs</code>。<br>':
      '<code>--radius</code> <code>--card-w</code> <code>--fs</code>.<br>',
    '⚠ 浅色主题的变量定义在 <code>html[data-theme="light"]</code> 上，比 <code>:root</code> 更具体，':
      '⚠ Light-theme variables are defined on <code>html[data-theme="light"]</code>, which is more specific than <code>:root</code>, ',
    '所以只写 <code>:root{…}</code> 在浅色下不生效。两种主题都要改就用 ':
      'so <code>:root{…}</code> alone has no effect in light mode. To cover both themes use ',
    '<code>html[data-theme]{--primary:#e11d48}</code>，浅色深色通吃。':
      '<code>html[data-theme]{--primary:#e11d48}</code>, which works in both.',
    '只想改某张卡的样式请写在插件的 <code>css</code> 字段里。</div>':
      'To style a single card type, put the CSS in the plugin’s <code>css</code> field.</div>',
    'autocapitalize="off" autocorrect="off" placeholder="/* 例：:root { --primary: #e11d48; } */">':
      'autocapitalize="off" autocorrect="off" placeholder="/* e.g. :root { --primary: #e11d48; } */">',
    '<button class="btn btn--primary btn--sm" data-act="css:apply">应用样式</button>':
      '<button class="btn btn--primary btn--sm" data-act="css:apply">Apply</button>',
    '<button class="btn btn--ghost btn--sm" data-act="css:clear">清空</button>':
      '<button class="btn btn--ghost btn--sm" data-act="css:clear">Clear</button>',
    '已启用自定义样式': 'Custom CSS is active',
    '当前未启用': 'Not active',
    '<div class="card-panel"><div class="section-title">💾 数据</div>':
      '<div class="card-panel"><div class="section-title">💾 Data</div>',
    '</b><span>牌组</span></div>': '</b><span>Decks</span></div>',
    '</b><span>卡片</span></div>': '</b><span>Cards</span></div>',
    '</b><span>复习记录</span></div>': '</b><span>Review logs</span></div>',
    '</b><span>存储项</span></div>': '</b><span>Storage keys</span></div>',
    '<button class="btn btn--sm" data-act="data:export">导出备份 (.zip)</button>':
      '<button class="btn btn--sm" data-act="data:export">Export backup (.zip)</button>',
    '<button class="btn btn--sm" data-act="data:import">导入备份 (.zip)</button>':
      '<button class="btn btn--sm" data-act="data:import">Import backup (.zip)</button>',
    '<button class="btn btn--sm btn--danger" data-act="data:clear">清空所有数据</button>':
      '<button class="btn btn--sm btn--danger" data-act="data:clear">Erase all data</button>',
    '<div class="muted" style="margin-top:10px">备份是一个普通的 .zip，里面有牌组与卡片、成长数据、设置、自定义 CSS 和已安装的插件——单拎出其中任何一个文件改完再打回去也是合法备份。</div>':
      '<div class="muted" style="margin-top:10px">A backup is an ordinary .zip holding your decks and cards, growth data, settings, custom CSS and installed plugins — pull any one file out, edit it, and zip it back up; it stays a valid backup.</div>',
    '<div class="muted" style="margin-top:6px">数据保存在本机 localStorage，卸载 App 或清理数据会丢失，建议定期导出备份。</div>':
      '<div class="muted" style="margin-top:6px">Data is stored in this device’s localStorage. Uninstalling the app or clearing its data wipes it — export a backup regularly.</div>',
    '<div class="card-panel"><div class="section-title">🛟 自动快照</div>':
      '<div class="card-panel"><div class="section-title">🛟 Auto snapshots</div>',
    '<div id="snap-list"><div class="muted">正在读取…</div></div>':
      '<div id="snap-list"><div class="muted">Loading…</div></div>',
    '<button class="btn btn--sm" data-act="snap:now">立即备份一份</button>':
      '<button class="btn btn--sm" data-act="snap:now">Snapshot now</button>',
    '<button class="btn btn--sm btn--ghost" data-act="snap:refresh">刷新列表</button>':
      '<button class="btn btn--sm btn--ghost" data-act="snap:refresh">Refresh list</button>',
    '<button class="btn btn--sm btn--danger" data-act="snap:clear">清空快照</button>':
      '<button class="btn btn--sm btn--danger" data-act="snap:clear">Clear snapshots</button>',
    '<div class="muted" style="margin-top:10px">每次启动自动存一份（同一小时内只存一次），只保留最近 10 份。':
      '<div class="muted" style="margin-top:10px">One snapshot per launch (at most one per hour); the latest 10 are kept. ',
    '快照放在 IndexedDB，不会占用 localStorage 的 5MB 配额。</div>':
      'Snapshots live in IndexedDB, so they do not use the 5 MB localStorage quota.</div>',
    '<div class="card-panel"><div class="section-title">📑 CSV / TSV</div>':
      '<div class="card-panel"><div class="section-title">📑 CSV / TSV</div>',
    '<div class="muted" style="margin-bottom:10px">用来和 Anki、Excel、Notion 交换数据：':
      '<div class="muted" style="margin-bottom:10px">Exchange data with Anki, Excel or Notion: ',
    '第一行是表头（字段名或字段标签），后面每行一张卡。</div>':
      'the first row is the header (field key or label); each following row is one card.</div>',
    '<button class="btn btn--sm" data-act="csv:export">导出当前牌组为 CSV</button>':
      '<button class="btn btn--sm" data-act="csv:export">Export current deck as CSV</button>',
    '<button class="btn btn--sm" data-act="csv:import">从 CSV / TSV 导入</button>':
      '<button class="btn btn--sm" data-act="csv:import">Import from CSV / TSV</button>',
    '<div class="card-panel"><div class="section-title">ℹ️ 关于</div>':
      '<div class="card-panel"><div class="section-title">ℹ️ About</div>',
    // 品牌行：中英混排是有意的，两边都保持原样
    '<b style="color:var(--fg)">闪卡 · FlashCards</b> v1.0.0<br>':
      '<b style="color:var(--fg)">闪卡 · FlashCards</b> v1.0.0<br>',
    '纯前端单页应用，无任何外部依赖，可离线使用。<br>':
      'A pure front-end single-page app with no external dependencies. Works offline.<br>',
    '调度算法：SM-2 简化版（重来 / 困难 / 良好 / 简单）。<br>':
      'Scheduling: a simplified SM-2 (Again / Hard / Good / Easy).<br>',
    '扩展方式：编写 JSON 插件即可新增卡片类型与 AI 提示词。':
      'Extend it by writing a JSON plugin — no code changes needed.',

    /* ---------------- 各种流程 / 弹窗 ---------------- */
    '队列已刷新': 'Queue refreshed',
    '确定删除这张卡片？': 'Delete this card?',
    '已恢复': 'Restored',
    '已暂停': 'Suspended',
    '内置插件已停用': 'Built-in plugin disabled',
    '删除插件': 'Delete plugin',
    '删除后该卡型的新建/编辑将不可用（已有卡片数据仍保留）。确定？':
      'After deleting, this card type can no longer be used for new or edited cards (existing cards are kept). Continue?',
    '自定义样式已应用': 'Custom CSS applied',
    '已清空自定义样式': 'Custom CSS cleared',
    '导出失败：': 'Export failed: ',
    '请在弹出的窗口里把文件名填成：{n}': 'In the dialog that opens, name the file: {n}',
    '打包失败：': 'Could not build the zip: ',
    '已导出备份（{n} 个文件）': 'Backup exported ({n} files)',
    '读取 zip 失败：': 'Could not read the zip: ',
    '这个 zip 里没有本 App 的备份文件': 'This zip holds no backup for this app',
    '这个包里是：': 'This backup contains: ',
    '未知内容': 'unknown contents',
    '牌组 {d} 个 · 卡片 {c} 张 · 插件 {p} 个': '{d} decks · {c} cards · {p} plugins',
    '已导入：': 'Imported: ',
    '没有可导入的内容': 'nothing to import',
    '跳过了 {n} 项：': 'Skipped {n}: ',
    '{n} 个牌组': '{n} decks',
    '{n} 张卡片': '{n} cards',
    '{n} 个插件': '{n} plugins',
    '成长数据': 'growth data',
    '自定义 CSS': 'custom CSS',
    '、': ', ',
    '。': '. ',
    '手动备份': 'Manual snapshot',
    '已备份一份快照': 'Snapshot saved',
    '这台设备不支持本地快照': 'This device does not support local snapshots',
    '已刷新': 'Refreshed',
    '清空快照': 'Clear snapshots',
    '会删掉全部自动快照，之后就没法回滚了。确定吗？':
      'All auto snapshots will be deleted and you will not be able to roll back. Continue?',
    '清空': 'Clear',
    '快照已清空': 'Snapshots cleared',
    '清空所有数据': 'Erase all data',
    '所有牌组、卡片、复习记录都会被删除，且不可恢复！建议先导出备份。':
      'All decks, cards and review logs will be deleted permanently. Export a backup first.',
    '确认清空': 'Erase',
    '最后确认': 'Final confirmation',
    '真的要清空吗？此操作不可撤销。': 'Really erase everything? This cannot be undone.',
    '已清空': 'Erased',
    '<div class="msg msg--warn">这台设备的 WebView 不支持 IndexedDB，自动快照不可用。':
      '<div class="msg msg--warn">This device’s WebView does not support IndexedDB, so auto snapshots are unavailable. ',
    '请用「导出全部备份」手动保存。</div>': 'Use “Export all” to save a backup manually.</div>',
    '<div class="muted">还没有快照。每次启动会自动存一份。</div>':
      '<div class="muted">No snapshots yet. One is saved on every launch.</div>',
    ' 牌组 / ': ' decks / ',
    ' 卡片</span></div>': ' cards</span></div>',
    '恢复到这份': 'Restore this one',
    '恢复': 'Restore',
    '恢复快照': 'Restore snapshot',
    '会用这份快照整体覆盖当前的所有牌组和卡片，当前数据将被替换。确定吗？':
      'This snapshot will replace all current decks and cards. Continue?',
    '恢复前自动备份': 'Auto-snapshot before restoring',
    '已恢复到 ': 'Restored to ',
    '恢复失败：': 'Restore failed: ',
    '先选一个牌组': 'Pick a deck first',
    '已导出 {n} 张卡的 CSV': 'Exported {n} cards as CSV',
    '<div class="msg msg--warn">支持 CSV / TSV（分隔符自动识别，也能手动选）。':
      '<div class="msg msg--warn">CSV / TSV supported (the delimiter is auto-detected). ',
    '首行是表头，用字段 key 或字段标签都能对上。</div>':
      'The first row is the header; field keys or labels both match.</div>',
    '<label class="field"><span>目标牌组</span><select id="csv-deck">':
      '<label class="field"><span>Target deck</span><select id="csv-deck">',
    '　(': ' (',
    '<label class="field"><span>粘贴 CSV / TSV 内容</span>':
      '<label class="field"><span>Paste CSV / TSV</span>',
    '<textarea id="csv-text" style="min-height:140px" placeholder="front,back&#10;问题,答案"></textarea></label>':
      '<textarea id="csv-text" style="min-height:140px" placeholder="front,back&#10;question,answer"></textarea></label>',
    '<div class="row row--wrap" style="gap:8px"><button class="btn btn--sm" data-act="m:pick">📂 选择文件</button>':
      '<div class="row row--wrap" style="gap:8px"><button class="btn btn--sm" data-act="m:pick">📂 Choose file</button>',
    '从 CSV / TSV 导入': 'Import from CSV / TSV',
    '<button class="btn btn--primary" data-act="m:go">导入</button>':
      '<button class="btn btn--primary" data-act="m:go">Import</button>',
    '分隔符「{n}」，共 ': 'Separator “{n}”, ',
    ' 行数据。<br>': ' rows.<br>',
    '列映射：': 'Column mapping: ',
    '→': '→',
    '<b>忽略</b>': '<b>ignore</b>',
    '请先粘贴内容': 'Paste something first',
    '没有解析出任何有效行': 'No valid rows found',
    '导入 {n} 张卡片': 'Imported {n} cards',
    '标签': 'Tags',
    '打字作答已开启：挖空卡要自己打出来': 'Typing mode on — type the blanks yourself',
    '已关闭打字作答': 'Typing mode off',
    '新建牌组': 'New deck',
    '说明': 'Description',
    '选填': 'optional',
    '已创建「{n}」': 'Created “{n}”',
    '牌组设置': 'Deck settings',
    '名称': 'Name',
    '卡型已切换（老卡仍按原卡型渲染）': 'Card type changed (existing cards keep rendering with their original type)',
    '删除牌组': 'Delete deck',
    '「{n}」及其 ': '“{n}” and its ',
    ' 张卡片会被永久删除。确定吗？': ' cards will be permanently deleted. Continue?',
    '已导出牌组': 'Deck exported',
    '格式：空行分隔每张卡；卡内第一行 =「{n}」，其余行 =「':
      'Format: a blank line between cards; the first line of each card = “{n}”, the rest = “',
    '背面': 'back',
    '」。': '”.',
    '<textarea id="bulk-text" class="code-area" style="min-height:220px" placeholder="粘贴内容…"></textarea>':
      '<textarea id="bulk-text" class="code-area" style="min-height:220px" placeholder="Paste content…"></textarea>',
    '批量导入 · ': 'Bulk import · ',
    '内容为空': 'Nothing to import',
    '<div class="msg msg--warn">卡型：': '<div class="msg msg--warn">Card type: ',
    '　提示词可在插件页自定义。</div>': ' The prompt can be customized on the plugins page.</div>',
    '<label class="field"><span>材料</span><textarea id="ai-gen-text" style="min-height:160px" placeholder="粘贴文章 / 笔记 / 教材段落…"></textarea></label>':
      '<label class="field"><span>Material</span><textarea id="ai-gen-text" style="min-height:160px" placeholder="Paste an article / notes / textbook passage…"></textarea></label>',
    '<div class="row row--between" style="margin-top:10px"><span class="muted">引擎</span>':
      '<div class="row row--between" style="margin-top:10px"><span class="muted">Engine</span>',
    '<select id="ai-gen-engine" style="width:140px"><option value="ai">🤖 AI</option><option value="local">⚡ 本地规则</option></select></div>':
      '<select id="ai-gen-engine" style="width:140px"><option value="ai">🤖 AI</option><option value="local">⚡ Local rules</option></select></div>',
    'AI 生成卡片 · ': 'AI generate · ',
    '<button class="btn btn--primary" data-act="m:go">生成</button>':
      '<button class="btn btn--primary" data-act="m:go">Generate</button>',
    '请粘贴材料': 'Paste material first',
    '<div class="msg msg--warn"><span class="spin"></span> 生成中，请稍候…</div>':
      '<div class="msg msg--warn"><span class="spin"></span> Generating, please wait…</div>',
    '生成 {n} 张卡片': 'Created {n} cards',
    '（本地兜底）': ' (local fallback)',
    '<div class="msg msg--warn">这张卡已经答错 <b>':
      '<div class="msg msg--warn">This card has been answered wrong <b>',
    '</b> 次。': '</b> times. ',
    '让 AI 把它拆成几张「一张只考一件事」的小卡。</div>':
      'Let AI split it into small cards that each test one thing.</div>',
    '<div class="row row--between" style="margin-top:6px"><span class="muted">原卡怎么处理</span>':
      '<div class="row row--between" style="margin-top:6px"><span class="muted">What to do with the original</span>',
    '<option value="suspend">挂起原卡（推荐）</option>':
      '<option value="suspend">Suspend the original (recommended)</option>',
    '<option value="keep">保留原卡继续复习</option>': '<option value="keep">Keep the original</option>',
    '<option value="delete">拆完删掉原卡</option>': '<option value="delete">Delete the original after splitting</option>',
    '✂️ AI 拆卡': '✂️ Split with AI',
    '<button class="btn btn--primary" data-act="m:go">开始拆</button>':
      '<button class="btn btn--primary" data-act="m:go">Split it</button>',
    '<div class="msg msg--warn">AI 认为这张卡已经足够简单，没有可拆的。</div>':
      '<div class="msg msg--warn">AI thinks this card is already simple enough to split.</div>',
    '<div class="muted" style="margin:10px 0 6px">拆出 ': '<div class="muted" style="margin:10px 0 6px">Split into ',
    ' 张（可编辑后再导入）：</div>': ' cards (editable before importing):</div>',
    '拆出 {n} 张卡片': 'Split into {n} cards',
    '<div class="msg msg--warn"><span class="spin"></span> 让 AI 拆卡中，请稍候…</div>':
      '<div class="msg msg--warn"><span class="spin"></span> Splitting with AI, please wait…</div>',
    '<br>可以在设置页检查 AI 配置，或先用「编辑」手动拆。</div>':
      '<br>Check your AI settings, or split it manually with “Edit”.</div>',
    '导入这 {n} 张': 'Import these {n}',
    '还没有挖空，先挖几个空吧': 'No blanks yet — create some first',
    '请先创建并选择目标牌组': 'Create and pick a target deck first',
    '目标牌组已切换为「挖空（Cloze）」卡型': 'Target deck switched to the “Cloze” card type',
    '已保存 {n} 张卡片到「': 'Saved {n} cards to “',
    '先粘贴插件 JSON': 'Paste the plugin JSON first',
    'JSON 语法错误：': 'JSON syntax error: ',
    '插件「{n}」安装成功': 'Plugin “{n}” installed',
    '清单里没有 examples': 'No “examples” in the manifest',
    '正在安装 {n} …': 'Installing {n} …',
    '读取 {n} 失败：': 'Failed to read {n}: ',
    '从网址安装插件': 'Install plugin from URL',
    '插件 JSON 的 URL': 'URL of the plugin JSON',
    '正在下载…': 'Downloading…',
    '下载失败：{n}（可能是 CORS 限制）': 'Download failed: {n} (probably a CORS restriction)',

    /* ---------------- 插件开发文档（弹层） ---------------- */
    '<div class="msg msg--ok"><b>插件 = 一个 JSON 对象</b>，丢进插件页即可扩展新的卡片类型，无需改代码。</div>':
      '<div class="msg msg--ok"><b>A plugin is a JSON object.</b> Drop it into the plugins page to add a new card type — no code changes needed.</div>',
    '<div class="section-title" style="margin-top:14px">顶层字段</div>':
      '<div class="section-title" style="margin-top:14px">Top-level fields</div>',
    'id          <span class="muted">必填，唯一标识，如 my.type</span><br>':
      'id          <span class="muted">required, unique, e.g. my.type</span><br>',
    'name        <span class="muted">必填，显示名</span><br>':
      'name        <span class="muted">required, display name</span><br>',
    'icon        <span class="muted">可选，emoji</span><br>':
      'icon        <span class="muted">optional, emoji</span><br>',
    'version     <span class="muted">可选，如 1.0.0</span><br>':
      'version     <span class="muted">optional, e.g. 1.0.0</span><br>',
    'apiVersion  <span class="muted">必填，当前为 1</span><br>':
      'apiVersion  <span class="muted">required, currently 1</span><br>',
    'description <span class="muted">可选，一句话说明</span><br>':
      'description <span class="muted">optional, one line</span><br>',
    'mode        <span class="muted">template（默认）或 cloze</span><br>':
      'mode        <span class="muted">template (default) or cloze</span><br>',
    'fields      <span class="muted">必填，字段数组</span><br>':
      'fields      <span class="muted">required, array of fields</span><br>',
    'templates   <span class="muted">必填，{front, back}</span><br>':
      'templates   <span class="muted">required, {front, back}</span><br>',
    'css         <span class="muted">可选，该卡型样式</span><br>':
      'css         <span class="muted">optional, CSS for this card type</span><br>',
    'ai          <span class="muted">可选，{kind, prompt}</span>':
      'ai          <span class="muted">optional, {kind, prompt}</span>',
    '<div class="section-title" style="margin-top:16px">fields[] 字段</div>':
      '<div class="section-title" style="margin-top:16px">fields[] entries</div>',
    'key      <span class="muted">必填，模板里用 {{key}} 引用</span><br>':
      'key      <span class="muted">required, referenced as {{key}} in templates</span><br>',
    'label    <span class="muted">必填，编辑器里的显示名</span><br>':
      'label    <span class="muted">required, label shown in the editor</span><br>',
    'required <span class="muted">true 时保存前必须填写</span><br>':
      'required <span class="muted">when true the field must be filled before saving</span><br>',
    'placeholder / hint / default / options(select 用)':
      'placeholder / hint / default / options (for select)',
    '<div class="section-title" style="margin-top:16px">模板语法（Mustache 子集）</div>':
      '<div class="section-title" style="margin-top:16px">Template syntax (Mustache subset)</div>',
    '{{key}}              <span class="muted">输出字段（HTML 转义）</span><br>':
      '{{key}}              <span class="muted">output a field (HTML-escaped)</span><br>',
    '{{{key}}}            <span class="muted">输出字段（不转义，可含 HTML）</span><br>':
      '{{{key}}}            <span class="muted">output a field (raw, may contain HTML)</span><br>',
    '{{#key}}…{{/key}}    <span class="muted">区块：数组则循环，真值则渲染一次</span><br>':
      '{{#key}}…{{/key}}    <span class="muted">section: loops over arrays, renders once if truthy</span><br>',
    '{{^key}}…{{/key}}    <span class="muted">反向区块：为空时渲染</span><br>':
      '{{^key}}…{{/key}}    <span class="muted">inverted section: renders when empty</span><br>',
    '{{.}}                <span class="muted">循环中的当前元素</span>':
      '{{.}}                <span class="muted">the current item inside a loop</span>',
    '<div class="section-title" style="margin-top:16px">内置过滤器（用 | 串联）</div>':
      '<div class="section-title" style="margin-top:16px">Built-in filters (chain with |)</div>',
    'nl2br upper lower trim length json first last join:分隔符 default:兜底 wrap:前后缀 repeat:次数 shuffle list':
      'nl2br upper lower trim length json first last join:sep default:fallback wrap:prefix,suffix repeat:times shuffle list',
    '<div class="section-title" style="margin-top:16px">AI 契约</div>':
      '<div class="section-title" style="margin-top:16px">AI contract</div>',
    'ai.kind    <span class="muted">cards（返回字段对象数组）或 cloze（返回带挖空标记的文本）</span><br>':
      'ai.kind    <span class="muted">cards (array of field objects) or cloze (text with cloze markers)</span><br>',
    'ai.prompt  <span class="muted">提示词，可用 {{text}} 与 {{count}} 占位</span>':
      'ai.prompt  <span class="muted">the prompt; {{text}} and {{count}} are placeholders</span>',
    '<div class="muted" style="margin-top:8px">cards 模式下模型需返回：<span class="mono">{"cards":[{字段key: 值, ...}]}</span></div>':
      '<div class="muted" style="margin-top:8px">In cards mode the model must return: <span class="mono">{"cards":[{fieldKey: value, ...}]}</span></div>',
    '<div class="section-title" style="margin-top:16px">挖空卡型</div>':
      '<div class="section-title" style="margin-top:16px">Cloze card types</div>',
    '<div class="muted" style="line-height:1.9">mode 设为 cloze，并保证 fields 里有一个 <span class="mono">type:"cloze"</span> 字段。':
      '<div class="muted" style="line-height:1.9">Set mode to cloze and make sure one field has <span class="mono">type:"cloze"</span>. ',
    '渲染时该字段会被替换成已渲染好的挖空 HTML（写 {{key}} 或 {{{key}}} 都行）。<br>':
      'That field is replaced by pre-rendered cloze HTML (use {{key}} or {{{key}}}).<br>',
    '标记语法：<span class="mono">{{c1::答案}}</span> 或 <span class="mono">{{c1::答案::提示}}</span>；编号决定拆几张卡。</div>':
      'Marker syntax: <span class="mono">{{c1::answer}}</span> or <span class="mono">{{c1::answer::hint}}</span>; the number decides how many cards are made.</div>',
    '插件开发文档': 'Plugin developer docs',
    '<button class="btn btn--primary" data-act="m:close">知道了</button>':
      '<button class="btn btn--primary" data-act="m:close">Got it</button>',

    /* ---------------- 连接测试 / 备份 ---------------- */
    '<div class="msg msg--warn"><span class="spin"></span> 正在请求…</div>':
      '<div class="msg msg--warn"><span class="spin"></span> Requesting…</div>',
    '<div class="msg msg--ok">✓ 连接成功<br><span class="mono">':
      '<div class="msg msg--ok">✓ Connected<br><span class="mono">',
    '已填入 {n} 预设，别忘了填 API Key': 'Filled in the {n} preset — don’t forget the API key',
    '文件不是合法 JSON': 'File is not valid JSON',
    '导入备份': 'Import backup',
    '选择「合并」会保留现有数据（重复牌组自动改名）；选择「替换」将清空现有数据。':
      '“Merge” keeps your data (duplicate decks get renamed); “Replace” wipes it first.',
    '合并导入': 'Merge',
    '合并完成：{n} 牌组 / ': 'Merged: {n} decks / ',
    ' 卡片': ' cards',
    '替换导入': 'Replace',
    '这会清空当前所有数据，确定吗？': 'This erases all current data. Continue?',
    '确认替换': 'Replace',
    '替换导入完成': 'Replace import finished',
    '导入失败：': 'Import failed: ',

    /* ---------------- 首次启动的示例 ---------------- */
    '欢迎使用闪卡 👋': 'Welcome to FlashCards 👋',
    '要现在创建一个示例牌组吗？\n会内置「挖空」和「基础问答」两张演示卡，方便你快速上手。':
      'Create a sample deck now?\nIt includes a cloze card and a basic Q&A card to get you started.',
    '创建示例': 'Create sample',
    '示例 · 挖空': 'Sample · Cloze',
    '人体最大的器官是{{c1::皮肤}}，它分为{{c2::表皮}}和{{c3::真皮}}两层。':
      'The largest organ of the human body is the {{c1::skin}}, made of the {{c2::epidermis}} and the {{c3::dermis}}.',
    '成人的皮肤面积约 1.5–2 平方米。': 'An adult’s skin covers about 1.5–2 m².',
    '生物': 'Biology',
    '示例 · 基础问答': 'Sample · Basic Q&A',
    'SM-2 算法中的「难度因子（Ease Factor）」初始值通常是多少？':
      'What is the usual initial value of the ease factor in the SM-2 algorithm?',
    '2.5。每次评分后按 0.15~0.2 的幅度调整，并夹在 1.3 ~ 3.0 之间。':
      '2.5. It is adjusted by 0.15–0.2 after each rating and clamped between 1.3 and 3.0.',
    '本应用用的就是这套规则的简化版。': 'This app uses a simplified version of that rule.',
    '算法': 'Algorithms',
    '示例牌组已创建，点卡片看答案，再评分': 'Sample decks created. Tap a card to reveal, then rate it',

    /* ---------------- 挖空编辑器里的提示 ---------------- */
    '<span class="hint">用 {{c1::答案}} 标记挖空，可加提示 {{c1::答案::提示}}</span>':
      '<span class="hint">Mark blanks with {{c1::answer}}, optionally {{c1::answer::hint}}</span>',
    '直接粘贴带 {{c1::答案}} 标记的文本，每段一张卡（空行分隔）。':
      'Paste text containing {{c1::answer}} markers — one card per paragraph (blank line separated).',
    '没有检测到挖空标记 {{c1::…}}': 'No cloze markers found ({{c1::…}})',
    '细胞呼吸的场所是{{c1::线粒体}}，其产物包括{{c2::二氧化碳}}和{{c3::水::化学式 H2O}}。':
      'Cellular respiration happens in the {{c1::mitochondria}}, producing {{c2::carbon dioxide}} and {{c3::water::formula H₂O}}.',
    '<div class="muted" style="margin-top:8px">例：{{back|nl2br}}　{{#choices}}<li>{{.}}</li>{{/choices}}</div>':
      '<div class="muted" style="margin-top:8px">e.g. {{back|nl2br}}　{{#choices}}<li>{{.}}</li>{{/choices}}</div>',

    /* ============================================================
     * 内置插件（plugins.js 的 BUILTIN，经 localize() 在读取时翻译）
     * 只翻显示文案；字段 key / templates / css 不动。
     * ============================================================ */
    '基础问答': 'Basic Q&A',
    '最经典的正反面卡片：正面问题，背面答案。': 'The classic two-sided card: question on the front, answer on the back.',
    '正面（问题）': 'Front (question)',
    '背面（答案）': 'Back (answer)',
    '备注': 'Note',
    '例如：TCP 三次握手的作用是什么？': 'e.g. What does the TCP three-way handshake accomplish?',
    '例如：同步双方初始序列号，确认收发能力…': 'e.g. Synchronise initial sequence numbers and confirm both sides can send and receive…',
    '选填，仅在答案页显示': 'optional, shown on the answer side only',
    '请把下面材料拆成 {{count}} 张问答闪卡。\n要求：每张卡只考一个知识点；问题必须能脱离原文独立理解；答案简洁准确（不超过 80 字）。\n只输出 JSON，格式：{"cards":[{"front":"问题","back":"答案","note":"可选备注"}]}\n\n材料：\n{{text}}':
      'Turn the material below into {{count}} Q&A flashcards.\nRequirements: each card tests exactly one fact; the question must be understandable on its own; the answer must be concise and accurate (under 80 characters).\nOutput JSON only, in the form: {"cards":[{"front":"question","back":"answer","note":"optional note"}]}\n\nMaterial:\n{{text}}',

    '挖空（Cloze）': 'Cloze',
    '在一段文本中挖掉关键词。标记格式 {{c1::答案}} 或 {{c1::答案::提示}}。':
      'Blank out keywords in a passage. Markers: {{c1::answer}} or {{c1::answer::hint}}.',
    '挖空文本': 'Cloze text',
    '在里面选中文字点「挖空」，或用「智能挖空」自动生成':
      'Select text and tap “Cloze”, or let “Smart cloze” pick the blanks',
    '补充说明': 'Extra note',
    '选填，复习时显示在答案下方': 'optional, shown under the answer while reviewing',
    '来源': 'Source',
    '选填，如《生理学》第 3 章': 'optional, e.g. “Physiology, chapter 3”',
    '请把下面材料改写成挖空填空题，共挖 {{count}} 个空。\n规则：\n1. 只挖关键信息（术语、数字、年份、结论），不要挖虚词；\n2. 使用 {{c1::答案}} 语法，编号从 c1 开始依次递增；\n3. 除挖空标记外，原文必须逐字保留，不要改写、不要总结；\n4. 必要时可写成 {{c1::答案::提示}}，提示是帮你回忆的线索。\n只输出 JSON，格式：{"text":"带挖空标记的完整文本"}\n\n材料：\n{{text}}':
      'Rewrite the material below as a fill-in-the-blanks exercise with {{count}} blanks.\nRules:\n1. Only blank out key information (terms, numbers, years, conclusions) — never function words;\n2. Use the {{c1::answer}} syntax with ids starting at c1 and increasing;\n3. Apart from the markers the text must be preserved word for word — do not rewrite or summarise;\n4. Where helpful write {{c1::answer::hint}}; the hint is a cue that helps you recall.\nOutput JSON only, in the form: {"text":"the full text with cloze markers"}\n\nMaterial:\n{{text}}',

    '问答 + 出处': 'Q&A + source',
    '演示插件：多字段 + 区块语法 {{#字段}}，适合考证/法规类记忆。':
      'Demo plugin: several fields plus section syntax {{#field}} — good for exams and regulations.',
    '问题': 'Question',
    '答案': 'Answer',
    '出处条款': 'Source clause',
    '易混淆选项': 'Easily confused options',
    '每行一个': 'one per line',
    '把下面材料拆成 {{count}} 张问答卡，每张包含问题、答案、出处条款（若原文没有出处则留空）。\n只输出 JSON：{"cards":[{"q":"问题","a":"答案","law":"出处","tags":"标签1,标签2","choices":"易混淆项"}]}\n\n材料：\n{{text}}':
      'Turn the material below into {{count}} Q&A cards, each with a question, an answer and a source clause (leave it empty when the source is not stated).\nOutput JSON only: {"cards":[{"q":"question","a":"answer","law":"source","tags":"tag1,tag2","choices":"confusable option"}]}\n\nMaterial:\n{{text}}',

    /* ============================================================
     * 插件校验信息（plugins.js 的 validate）
     * 会直接弹给写插件的人看，所以也要翻。
     * ============================================================ */
    '插件必须是一个 JSON 对象 { }': 'A plugin must be a JSON object { }',
    '缺少 id（字符串，唯一标识）': 'Missing id (a unique string)',
    'id 只能包含字母/数字/._-，长度 2-64，且以字母或数字开头':
      'id may only contain letters, digits, dot, underscore and hyphen; must be 2-64 characters and start with a letter or digit',
    '缺少 name（插件显示名）': 'Missing name (the display name)',
    'apiVersion 必须为 {want}（当前收到 {got}）': 'apiVersion must be {want} (got {got})',
    'mode 只能是 "template" 或 "cloze"': 'mode must be either "template" or "cloze"',
    'fields 必须是非空数组': 'fields must be a non-empty array',
    'fields[{n}] 必须是对象': 'fields[{n}] must be an object',
    'fields[{n}] 缺少 key': 'fields[{n}] is missing its key',
    'fields 中 key 重复：{key}': 'duplicate field key: {key}',
    'fields[{n}].type 不支持：{type}（可用：{list}）': 'fields[{n}].type is not supported: {type} (available: {list})',
    'fields[{n}] 为 select 时必须提供 options 数组': 'fields[{n}] is a select, so it must provide an options array',
    'mode 为 "cloze" 时，fields 里必须有一个 type:"cloze" 的字段':
      'with mode "cloze" one of the fields must have type:"cloze"',
    '缺少 templates 对象（至少要有 front）': 'Missing the templates object (it needs at least front)',
    'templates.front 必须是字符串': 'templates.front must be a string',
    '没有 templates.back，背面将与正面相同': 'No templates.back — the back will look the same as the front',
    '模板 {side} 引用了未声明的字段：{key}': 'template {side} references an undeclared field: {key}',
    'ai 必须是对象': 'ai must be an object',
    'ai.kind 只能是 "cards" 或 "cloze"': 'ai.kind must be either "cards" or "cloze"',
    'ai.prompt 必须是字符串': 'ai.prompt must be a string',
    '没有 ai.prompt，该插件将无法使用 AI 生成': 'No ai.prompt — this plugin cannot use AI generation',
    'css 必须是字符串': 'css must be a string',
    '建议补充 description，便于在插件列表里识别':
      'Consider adding a description so the plugin is easy to spot in the list',

    /* ---------------- 成长体系（game.js + app.js 的成长视图） ---------------- */
    '成长': 'Growth',
    ' · 连续 ': ' · ',
    ' 天 · 已精通 ': ' day streak · ',
    '复习 {n} 张卡': 'Review {n} cards',
    '新建 {n} 张卡': 'Create {n} cards',
    '答对 {n} 张': 'Answer {n} correctly',
    '新造 {n} 张挖空卡': 'Make {n} cloze cards',
    '获得 {n} 点经验': 'Earn {n} XP',
    '复习 {n} 个不同牌组': 'Review cards from {n} decks',
    '把 {n} 张卡练到精通（5 级）': 'Master {n} cards (level 5)',
    '本周学习 {n} 天': 'Study {n} days this week',
    '1月': 'Jan',
    '2月': 'Feb',
    '3月': 'Mar',
    '4月': 'Apr',
    '5月': 'May',
    '6月': 'Jun',
    '7月': 'Jul',
    '8月': 'Aug',
    '9月': 'Sep',
    '10月': 'Oct',
    '11月': 'Nov',
    '12月': 'Dec',
    '掌握等级': 'Mastery',
    '已精通（休眠中）': 'Mastered (dormant)',
    '<b class="is-sleep">💤 已休眠</b>': '<b class="is-sleep">💤 Sleeping</b>',
    ' 经验': ' XP',
    '🎉 升级到 Lv.': '🎉 Level up — Lv.',
    '（': ' (',
    '）': ')',
    '🏅 解锁 ': '🏅 Unlocked ',
    ' 枚徽章': ' badges',
    '一': 'Mon',
    '三': 'Wed',
    '五': 'Fri',
    '日': 'Sun',
    ' · 复习 ': ' · reviewed ',
    ' 次 · 新建 ': ' · created ',
    ' 张': '',
    '最近 ': 'Last ',
    ' 周 · 活跃 ': ' weeks · ',
    ' 天 · 共 ': ' active days · ',
    ' 次': ' total',
    ' 次#1': ' time',
    '少': 'Less',
    '多': 'More',
    ' · 还差 ': ' · ',
    ' 点到 Lv.': ' XP to Lv.',
    '下一个称号：': 'Next title: ',
    '已经是最高称号了': 'Highest title reached',
    '连续天数': 'Day streak',
    '今天已打卡': 'Studied today',
    '今天还没学': 'Not studied yet',
    ' · 最长 ': ' · best ',
    ' 天': ' days',
    '当前连击': 'Current combo',
    '最佳 ': 'Best ',
    ' 次 · 断连只清连击': ' · a break only clears the combo',
    '已精通': 'Mastered',
    '累计复习 ': 'Reviews ',
    '正确率': 'Accuracy',
    '连击加成 +': 'Combo bonus +',
    '今日挑战': 'Daily challenges',
    '本周挑战': 'Weekly challenges',
    '<button class="btn btn--primary btn--block" style="margin-top:12px" data-act="gm:claim">领取 ': '<button class="btn btn--primary btn--block" style="margin-top:12px" data-act="gm:claim">Claim ',
    ' 个已完成的奖励</button>': ' rewards</button>',
    '<div class="muted" style="margin-top:12px;text-align:center">完成上面的挑战，奖励会自动出现在这里</div>': '<div class="muted" style="margin-top:12px;text-align:center">Finish the challenges above and your rewards will appear here</div>',
    '学习日历': 'Study calendar',
    '徽章': 'Badges',
    '成长数据（JSON）': 'Growth data (JSON)',
    '<div class="muted" style="margin-bottom:10px">等级、经验、称号、徽章、连续天数、每日学习流水、每张卡的掌握度——整个成长体系都能导出成一份 JSON。</div>': '<div class="muted" style="margin-bottom:10px">Level, XP, titles, badges, streaks, the daily study log and every card\'s mastery — the whole growth system exports to a single JSON file.</div>',
    '<button class="btn btn--sm" data-act="gm:export">导出成长 JSON</button>': '<button class="btn btn--sm" data-act="gm:export">Export growth JSON</button>',
    '<button class="btn btn--sm" data-act="gm:export-cards">含卡片掌握度</button>': '<button class="btn btn--sm" data-act="gm:export-cards">Include card mastery</button>',
    '<button class="btn btn--sm" data-act="gm:import">导入成长 JSON</button>': '<button class="btn btn--sm" data-act="gm:import">Import growth JSON</button>',
    '<button class="btn btn--sm btn--danger" data-act="gm:reset">重置成长数据</button>': '<button class="btn btn--sm btn--danger" data-act="gm:reset">Reset growth data</button>',
    '遗忘曲线': 'Forgetting curve',
    '记忆稳定度': 'Memory stability',
    '当前复习间隔': 'Current interval',
    '此刻还记得的概率': 'Recall probability now',
    '预计下次复习': 'Next review',
    '就是现在': 'Right now',
    '累计复习次数': 'Reviews',
    ' 天后': ' days from now',
    '<div class="fc-gm-note">曲线用的是 R(t) = e^(−t/S)：S 由 SRS 自己排出的间隔反推，所以图上的预测和调度器永远一致，不会出现「图上说该复习了、调度器却说还早」。圆点是你真实的复习记录，绿=答对，红=答错。</div>': '<div class="fc-gm-note">The curve is R(t) = e^(−t/S), with S derived from the interval the scheduler itself chose — so the chart and the scheduler can never disagree. The dots are your real reviews: green = correct, red = wrong.</div>',
    '<div class="fc-gm-note is-sleep">💤 这张卡已经精通（5 级），不再主动推给你复习。想再练一次就点下面的「唤醒」——唤醒会掉一级，需要重新靠复习赚回精通。</div>': '<div class="fc-gm-note is-sleep">💤 This card is mastered (level 5) and will no longer be pushed to you. Want another round? Tap “Wake” below — waking drops it one level, and you will have to earn mastery back through reviews.</div>',
    '<button class="btn btn--ghost" data-act="m:close">关闭</button>': '<button class="btn btn--ghost" data-act="m:close">Close</button>',
    '<button class="btn btn--primary" data-act="card:wake" data-id="': '<button class="btn btn--primary" data-act="card:wake" data-id="',
    '">💤 唤醒这张卡</button>': '">💤 Wake this card</button>',
    '已唤醒，这张卡重新回到复习队列': 'Woken up — this card is back in the review queue',
    '已导出成长数据': 'Growth data exported',
    '导入成长数据': 'Import growth data',
    '「合并」会把两边的经验、徽章、学习流水取并集（等级只升不降），适合多台设备一起用；「替换」会清空当前成长数据。': '“Merge” unions both sides\' XP, badges and study log (levels only ever go up) — good for using several devices. “Replace” wipes the current growth data.',
    '合并导入': 'Merge',
    '导入完成：Lv.': 'Import complete — Lv.',
    ' 张卡掌握度已同步': ' card mastery levels synced',
    '重置成长数据': 'Reset growth data',
    '等级、经验、徽章、连续天数、每日学习流水都会清空，卡片本身的复习进度不受影响。确定吗？': 'Level, XP, badges, streaks and the daily study log will all be wiped. The cards\' own review progress is untouched. Are you sure?',
    '确认重置': 'Reset',
    '成长数据已重置': 'Growth data reset',
    '领到 {n} 点经验（{m} 个任务）': 'Claimed {n} XP ({m} tasks)',
    '还没有可以领取的奖励': 'Nothing to claim yet',
    '见习学徒': 'Apprentice',
    '记忆学徒': 'Memory novice',
    '知识猎手': 'Knowledge hunter',
    '记忆行者': 'Memory walker',
    '知识守卫': 'Knowledge guard',
    '记忆大师': 'Memory master',
    '知识贤者': 'Knowledge sage',
    '记忆执政官': 'Memory archon',
    '传说记忆者': 'Legendary mind',
    '第一次复习': 'First review',
    '热身完毕': 'Warmed up',
    '百次复习': 'Hundred reviews',
    '千锤百炼': 'Forged by fire',
    '三日不辍': 'Three in a row',
    '一周不断': 'Full week',
    '一月成习': 'Habit formed',
    '十连击': 'Ten in a row',
    '五十连击': 'Fifty in a row',
    '挖空新手': 'Cloze rookie',
    '挖空工匠': 'Cloze artisan',
    '首张精通': 'First mastery',
    '十张精通': 'Ten mastered',
    '百张精通': 'Hundred mastered',
    '到达 5 级': 'Level 5',
    '到达 10 级': 'Level 10',
    '到达 20 级': 'Level 20',
    '任务达人': 'Task runner',
    '挑战常客': 'Challenge regular',
    '早起鸟': 'Early bird',
    '夜猫子': 'Night owl',
    '多线并行': 'Multitasker',
    '完成你的第一次评分': 'Complete your first rating',
    '累计复习 10 次': 'Review 10 times in total',
    '累计复习 100 次': 'Review 100 times in total',
    '累计复习 1000 次': 'Review 1000 times in total',
    '连续学习 3 天': 'Study 3 days straight',
    '连续学习 7 天': 'Study 7 days straight',
    '连续学习 30 天': 'Study 30 days straight',
    '连续答对 10 张': 'Answer 10 cards correctly in a row',
    '连续答对 50 张': 'Answer 50 cards correctly in a row',
    '亲手造 10 张挖空卡': 'Make 10 cloze cards by hand',
    '亲手造 100 张挖空卡': 'Make 100 cloze cards by hand',
    '把一张卡练到 5 级': 'Master one card (level 5)',
    '把 10 张卡练到 5 级': 'Master 10 cards (level 5)',
    '把 100 张卡练到 5 级': 'Master 100 cards (level 5)',
    '角色等级达到 5 级': 'Reach character level 5',
    '角色等级达到 10 级': 'Reach character level 10',
    '角色等级达到 20 级': 'Reach character level 20',
    '完成 10 个挑战任务': 'Complete 10 challenges',
    '完成 50 个挑战任务': 'Complete 50 challenges',
    '在早上 7 点前复习过': 'Review before 7 a.m.',
    '在晚上 23 点后复习过': 'Review after 11 p.m.',
    '一天里复习了 2 个以上的牌组': 'Review cards from 2 or more decks in a single day',
  });
})(window);
