/* XTodoY 主界面可点击原型：纯前端模拟，不持久化（刷新即重置）。 */

const state = {
  view: new URLSearchParams(location.search).get('view') || 'today',
  selected: null,
  tags: structuredClone(SEED_TAGS),
  todos: SEED_TODOS.map((t) => ({ done: false, doneAt: null, deleted: false, ...structuredClone(t) })),
  logs: seedLogs(),
  collapsedTags: new Set(),
  collapsedGroups: new Set(['todayDone']),
  includeChildren: true,
  search: '',
  statsTab: 'week',
  statsOffset: 0,
  sidebarCollapsed: false,
  renaming: null,
  calMonth: null,
  settings: {
    autostart: false, closeAction: 'tray', weekStart: 1, theme: localStorage.getItem('xtodoy-theme') || 'system',
    defaultReminder: 0, allDayTime: '08:30', snooze: 10, sound: true, inAppPopup: false, gpu: false,
    floating: true, floatingOpacity: 100, floatingLock: false,
    autoCheck: true, autoDownload: true, channel: 'stable',
  },
  // 更新（SRS F10）：phase = latest | checking | available | downloading | ready | error
  update: { phase: 'latest', current: '1.0.0', latest: '1.1.0', size: 38.6, progress: 0, lastCheck: '今天 09:12', error: '', skipped: false, justUpdated: false },
};

const RELEASE_NOTES = {
  date: '2026-11-10',
  items: [
    ['新增', '统计页支持导出本月完成记录为 CSV'],
    ['新增', '悬浮窗右键菜单可直接新建待办'],
    ['改进', '提醒调度更省电，休眠唤醒后补发更快'],
    ['修复', '跨月循环事项在 2 月可能跳过一次的问题'],
  ],
};

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- 日期工具 ---------- */
const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
const diffDays = (a, b) => Math.round((parse(a) - parse(b)) / 86400000);
function weekStartOf(s) {
  const d = parse(s); const ws = state.settings.weekStart;
  d.setDate(d.getDate() - ((d.getDay() - ws + 7) % 7)); return ymd(d);
}
function friendlyDate(s) {
  if (!s) return '';
  const n = diffDays(s, TODAY);
  if (n === 0) return '今天';
  if (n === 1) return '明天';
  if (n === -1) return '昨天';
  const d = parse(s);
  const base = `${d.getMonth() + 1}月${d.getDate()}日`;
  if (n > 1 && n < 7) return `周${WEEK[d.getDay()]}`;
  return d.getFullYear() === 2026 ? base : `${d.getFullYear()}年${base}`;
}
const isOverdue = (t) => !t.done && t.date && t.date < TODAY;

/* ---------- 标签工具 ---------- */
const tagById = (id) => state.tags.find((t) => t.id === id);
const children = (id) => state.tags.filter((t) => t.parent === id);
function descendants(id) { return children(id).flatMap((c) => [c.id, ...descendants(c.id)]); }
function depthOf(id) { let d = 0; let t = tagById(id); while (t && t.parent) { d++; t = tagById(t.parent); } return d; }
function subtreeHeight(id) { const c = children(id); return c.length ? 1 + Math.max(...c.map((x) => subtreeHeight(x.id))) : 0; }
function tagPath(id) { const p = []; let t = tagById(id); while (t) { p.unshift(t.name); t = tagById(t.parent); } return p.join(' / '); }
const liveTodos = () => state.todos.filter((t) => !t.deleted);

/* ---------- 循环规则 ---------- */
function repeatSummary(r) {
  if (!r) return '不重复';
  const every = (unit) => (r.interval > 1 ? `每 ${r.interval} ${unit}` : `每${unit}`);
  let s;
  if (r.type === 'daily') s = every('天');
  else if (r.type === 'weekdays') s = '每个工作日';
  else if (r.type === 'weekly') s = `${every('周')}${r.days?.length ? ` ${[...r.days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => '周' + WEEK[d]).join('、')}` : ''}`;
  else if (r.type === 'monthly') s = `${every('月')} ${r.monthDay === 'last' ? '最后一天' : `${r.monthDay} 日`}`;
  else if (r.type === 'yearly') s = every('年');
  if (r.end?.type === 'date') s += `，至 ${r.end.date}`;
  if (r.end?.type === 'count') s += `，共 ${r.end.count} 次`;
  return s;
}
function nextOccurrences(start, r, n = 5) {
  if (!r || !start) return [];
  const out = []; let cur = start; let guard = 0;
  const matches = (d) => {
    const day = parse(d);
    if (r.type === 'daily') return diffDays(d, start) % r.interval === 0;
    if (r.type === 'weekdays') return day.getDay() >= 1 && day.getDay() <= 5;
    if (r.type === 'weekly') return (r.days?.length ? r.days : [parse(start).getDay()]).includes(day.getDay()) && Math.floor(diffDays(weekStartOf(d), weekStartOf(start)) / 7) % r.interval === 0;
    if (r.type === 'monthly') {
      const last = new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate();
      const want = r.monthDay === 'last' ? last : Math.min(r.monthDay, last); // 月末规则（FR-REC-04）
      return day.getDate() === want;
    }
    if (r.type === 'yearly') { const s = parse(start); return day.getMonth() === s.getMonth() && day.getDate() === s.getDate(); }
    return false;
  };
  while (out.length < n && guard++ < 800) {
    if (matches(cur)) out.push(cur);
    if (r.end?.type === 'date' && cur >= r.end.date) break;
    if (r.end?.type === 'count' && out.length >= r.end.count) break;
    cur = addDays(cur, 1);
  }
  return out;
}

/* ---------- 提醒 ---------- */
const REMINDER_OPTIONS = [
  { min: 0, label: '准时' }, { min: 5, label: '提前 5 分钟' }, { min: 15, label: '提前 15 分钟' },
  { min: 30, label: '提前 30 分钟' }, { min: 60, label: '提前 1 小时' }, { min: 120, label: '提前 2 小时' }, { min: 1440, label: '提前 1 天' },
];
const reminderLabel = (r, t) => {
  const o = REMINDER_OPTIONS.find((x) => x.min === r.min);
  const base = o ? o.label : `提前 ${r.min} 分钟`;
  return t && !t.time && r.min === 0 ? `当天 ${state.settings.allDayTime}` : t && !t.time && r.min === 1440 ? `前一天 ${state.settings.allDayTime}` : base;
};

/* ---------- 视图数据 ---------- */
function todayTodos() { return liveTodos().filter((t) => t.date === TODAY); } // D-1：仅今天到期
function counts() {
  const live = liveTodos();
  const tagCount = {};
  for (const tg of state.tags) {
    const ids = [tg.id, ...descendants(tg.id)];
    tagCount[tg.id] = live.filter((t) => !t.done && t.tags.some((x) => ids.includes(x))).length;
  }
  return {
    today: todayTodos().filter((t) => !t.done).length,
    plan: live.filter((t) => !t.done && t.date).length,
    all: live.filter((t) => !t.done).length,
    done: live.filter((t) => t.done).length,
    trash: state.todos.filter((t) => t.deleted).length,
    tag: tagCount,
  };
}
const byTime = (a, b) => (a.date || '9999').localeCompare(b.date || '9999') || (a.time || '99').localeCompare(b.time || '99') || prioRank(a) - prioRank(b);
const prioRank = (t) => ({ high: 0, medium: 1, low: 2, none: 3 }[t.priority]);

function groupsForView() {
  const live = liveTodos();
  const v = state.view;
  if (state.search) {
    const q = state.search.toLowerCase();
    return [{ id: 'search', title: `搜索"${state.search}"`, items: live.filter((t) => (t.title + t.note).toLowerCase().includes(q)).sort(byTime) }];
  }
  if (v === 'today') {
    const all = todayTodos().sort(byTime);
    return [
      { id: 'todayOpen', title: null, items: all.filter((t) => !t.done) },
      { id: 'todayDone', title: '今日已完成', items: all.filter((t) => t.done), collapsible: true },
    ];
  }
  if (v === 'plan') {
    const open = live.filter((t) => !t.done && t.date).sort(byTime);
    const weekEnd = addDays(weekStartOf(TODAY), 6);
    return [
      { id: 'overdue', title: '逾期', items: open.filter((t) => t.date < TODAY), tone: 'overdue' },
      { id: 'pToday', title: '今天', items: open.filter((t) => t.date === TODAY) },
      { id: 'pTomorrow', title: '明天', items: open.filter((t) => t.date === addDays(TODAY, 1)) },
      { id: 'pWeek', title: '本周', items: open.filter((t) => t.date > addDays(TODAY, 1) && t.date <= weekEnd) },
      { id: 'pLater', title: '以后', items: open.filter((t) => t.date > weekEnd && t.date > addDays(TODAY, 1)) },
    ];
  }
  if (v === 'all') {
    const open = live.filter((t) => !t.done).sort(byTime);
    return [
      { id: 'aDated', title: '有日期', items: open.filter((t) => t.date) },
      { id: 'aNone', title: '无日期', items: open.filter((t) => !t.date) },
    ];
  }
  if (v === 'done') {
    const done = live.filter((t) => t.done).sort((a, b) => b.doneAt.localeCompare(a.doneAt));
    const groups = {};
    for (const t of done) { const d = t.doneAt.slice(0, 10); (groups[d] ||= []).push(t); }
    return Object.entries(groups).map(([d, items]) => ({ id: 'd' + d, title: `${friendlyDate(d)} · ${d}`, items }));
  }
  if (v === 'trash') return [{ id: 'trash', title: null, items: state.todos.filter((t) => t.deleted) }];
  if (v.startsWith('tag:')) {
    const id = v.slice(4);
    const ids = state.includeChildren ? [id, ...descendants(id)] : [id];
    return [{ id: 'tag', title: null, items: live.filter((t) => !t.done && t.tags.some((x) => ids.includes(x))).sort(byTime) }];
  }
  return [];
}

/* ---------- 渲染：侧边栏 ---------- */
function renderSidebar() {
  const c = counts();
  const rail = state.sidebarCollapsed;
  const item = (view, ic, label, count, key, badge) => `
    <button class="nav-item" data-action="view" data-view="${view}" ${state.view === view && !state.search ? 'aria-current="page"' : ''} title="${label}${count ? ` · ${count}` : ''}${key ? `（Ctrl+${key}）` : ''}${badge ? ` · ${badge}` : ''}" ${rail ? `aria-label="${label}${count ? `，${count} 项` : ''}"` : ''}>
      ${icon(ic, rail ? 20 : 16)}<span class="label">${label}</span>${count != null ? `<span class="count">${count}</span>` : ''}${rail && view === 'today' && count ? `<span class="rail-count" aria-hidden="true">${count > 99 ? '99+' : count}</span>` : ''}${badge ? `<span class="badge-dot" role="img" aria-label="${badge}"></span>` : ''}
    </button>`;
  const tree = (parent, depth) => children(parent).map((tg) => {
    const kids = children(tg.id).length > 0;
    const open = !state.collapsedTags.has(tg.id);
    return `
      <div role="treeitem" aria-expanded="${kids ? open : ''}" aria-level="${depth + 1}">
        <div class="nav-item tc-${tg.color}" style="padding-left:${8 + depth * 16}px" data-action="view" data-view="tag:${tg.id}" role="button" tabindex="0"
          ${state.view === 'tag:' + tg.id && !state.search ? 'aria-current="page"' : ''} title="${esc(tagPath(tg.id))}">
          ${kids ? `<span class="tree-toggle" data-action="toggle-tag" data-id="${tg.id}" aria-expanded="${open}" aria-label="${open ? '折叠' : '展开'} ${esc(tg.name)}" role="button" tabindex="-1">${icon('chevronDown', 12)}</span>` : '<span class="tree-spacer"></span>'}
          <span class="dot"></span><span class="label">${esc(tg.name)}</span><span class="count">${c.tag[tg.id] || ''}</span>
        </div>
        ${kids && open ? `<div role="group">${tree(tg.id, depth + 1)}</div>` : ''}
      </div>`;
  }).join('');
  return `
    <aside id="sidebar" class="sidebar ${rail ? 'is-rail' : ''}" aria-label="导航">
      <nav>
        ${item('today', 'sun', '今天', c.today, 1)}
        ${item('plan', 'calendar', '计划', c.plan, 2)}
        ${item('all', 'inbox', '全部', c.all, 3)}
        ${item('done', 'checkCircle', '已完成', c.done, 4)}
        ${item('trash', 'trash', '回收站', null, 5)}
        ${rail ? '' : `<div class="nav-section">
          <div class="nav-section-title"><span>标签</span>
            <button class="icon-btn" data-action="view" data-view="tags" aria-label="管理标签" title="管理标签">${icon('settings', 14)}</button>
          </div>
          <div role="tree" aria-label="标签">${tree(null, 0)}</div>
        </div>`}
      </nav>
      <div class="sidebar-footer">
        ${item('stats', 'chart', '统计')}
        ${item('tags', 'tag', '标签管理')}
        ${item('settings', 'settings', '设置', null, null, updateBadge())}
        <button class="nav-item sidebar-toggle" data-action="toggle-sidebar" aria-controls="sidebar" aria-expanded="${!rail}"
          aria-label="${rail ? '展开' : '收起'}侧边栏（Ctrl+B）" title="${rail ? '展开' : '收起'}侧边栏（Ctrl+B）">
          ${icon(rail ? 'panelLeftOpen' : 'panelLeftClose', rail ? 20 : 16)}<span class="label">收起侧边栏</span><kbd class="count">Ctrl+B</kbd>
        </button>
      </div>
    </aside>`;
}

/* ---------- 渲染：待办行 ---------- */
function todoRow(t) {
  const tags = t.tags.map(tagById).filter(Boolean);
  const shown = tags.slice(0, 2);
  const whenCls = isOverdue(t) ? 'overdue' : t.date === TODAY ? 'today' : '';
  const when = t.date ? `<span class="when ${whenCls}">${icon('calendar', 12)}${isOverdue(t) ? '逾期 · ' : ''}${friendlyDate(t.date)}${t.time ? ' ' + t.time : ''}</span>` : '';
  const trash = state.view === 'trash';
  return `
    <li class="todo ${t.done ? 'is-done' : ''}" data-id="${t.id}" role="option" aria-selected="${state.selected === t.id}" tabindex="0" data-action="select">
      ${trash ? '<span style="width:32px"></span>' : `
      <button class="check prio-${t.priority}" role="checkbox" aria-checked="${t.done}" aria-label="完成：${esc(t.title)}" data-action="toggle" data-id="${t.id}">
        <span class="ring">${icon('check', 12)}</span>
      </button>`}
      <div class="todo-body">
        <div class="todo-title"><span class="text">${esc(t.title)}</span></div>
        ${t.note ? `<div class="todo-note">${esc(t.note)}</div>` : ''}
        <div class="todo-meta">
          ${when}
          ${t.repeat ? `<span class="ico" title="循环：${esc(repeatSummary(t.repeat))}">${icon('repeat', 12)}<span class="sr-only">循环</span></span>` : ''}
          ${t.reminders.length ? `<span class="ico" title="提醒：${t.reminders.map((r) => reminderLabel(r, t)).join('、')}">${icon('bell', 12)}<span class="sr-only">有提醒</span></span>` : ''}
          ${t.priority !== 'none' ? `<span class="sr-only">优先级${{ high: '高', medium: '中', low: '低' }[t.priority]}</span>` : ''}
          ${shown.map((tg) => `<span class="chip tc-${tg.color}" title="${esc(tagPath(tg.id))}"><span class="dot"></span><span>${esc(tg.name)}</span></span>`).join('')}
          ${tags.length > 2 ? `<span class="chip more" title="${tags.slice(2).map((x) => esc(tagPath(x.id))).join('、')}">+${tags.length - 2}</span>` : ''}
          ${t.done && t.doneAt && state.view !== 'today' ? `<span>完成于 ${t.doneAt.slice(11)}</span>` : ''}
          ${trash ? `<span>删除于 ${t.deletedAt}，${30 - diffDays(TODAY, t.deletedAt)} 天后自动清理</span>` : ''}
        </div>
      </div>
      <div class="todo-actions">
        ${trash ? `
          <button class="btn sm" data-action="restore" data-id="${t.id}">${icon('restore', 14)}恢复</button>
          <button class="btn sm ghost" data-action="purge" data-id="${t.id}">永久删除</button>` : `
          <button class="icon-btn danger" data-action="delete" data-id="${t.id}" aria-label="删除 ${esc(t.title)}" title="删除（Delete）">${icon('trash', 14)}</button>`}
      </div>
    </li>`;
}

/* ---------- 渲染：列表视图 ---------- */
const VIEW_META = {
  today: { title: '今天', sub: () => `${parse(TODAY).getMonth() + 1}月${parse(TODAY).getDate()}日 周${WEEK[parse(TODAY).getDay()]}` },
  plan: { title: '计划', sub: () => '所有有截止日期的未完成事项' },
  all: { title: '全部', sub: () => '所有未完成事项' },
  done: { title: '已完成', sub: () => '按完成日期倒序' },
  trash: { title: '回收站', sub: () => '删除的事项保留 30 天' },
};

function renderList() {
  let title, sub, extra = '';
  if (state.search) { title = '搜索结果'; sub = '在标题与备注中匹配（不含回收站）'; }
  else if (state.view.startsWith('tag:')) {
    const tg = tagById(state.view.slice(4));
    title = `<span class="chip tc-${tg.color}" style="height:24px;font-size:var(--text-sm)"><span class="dot"></span><span>${esc(tg.name)}</span></span>`;
    sub = esc(tagPath(tg.id));
    extra = `<div class="seg" role="group" aria-label="范围">
      <button aria-pressed="${state.includeChildren}" data-action="include-children" data-val="1">包含子标签</button>
      <button aria-pressed="${!state.includeChildren}" data-action="include-children" data-val="0">仅本标签</button></div>`;
  } else { title = VIEW_META[state.view].title; sub = VIEW_META[state.view].sub(); }

  const groups = groupsForView();
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const canAdd = !['done', 'trash'].includes(state.view) && !state.search;
  const addHint = state.view === 'today' ? '截止日期：今天' : state.view.startsWith('tag:') ? `标签：${tagById(state.view.slice(4)).name}` : '';
  const todayAllDone = state.view === 'today' && !state.search && groups[0].items.length === 0 && groups[1].items.length > 0;

  let body;
  if (todayAllDone) {
    body = `<div class="empty success"><div class="badge">${icon('check', 28)}</div><h2>今天的事都做完了</h2><p>已完成 ${groups[1].items.length} 项，好好休息一下。</p></div>` + renderGroups(groups.slice(1));
  } else if (total === 0) {
    body = emptyState();
  } else body = renderGroups(groups);

  return `
    <main class="main" aria-label="${state.search ? '搜索结果' : VIEW_META[state.view]?.title || '标签'}">
      <header class="main-header">
        <div><h1>${title}</h1><div class="sub">${sub}</div></div>
        <span class="spacer"></span>${extra}
        ${state.view === 'trash' && total ? '<button class="btn sm ghost" data-action="purge-all">清空回收站</button>' : ''}
      </header>
      ${state.update.justUpdated && !state.search ? `<div class="banner info" role="status">${icon('checkCircle')}<span>已更新到 XTodoY ${state.update.current}</span><button class="btn sm ghost" data-action="upd-details">查看更新内容</button><span style="flex:1"></span><button class="icon-btn" data-action="upd-dismiss-banner" aria-label="关闭提示">${icon('x', 14)}</button></div>` : ''}
      ${state.view === 'today' && !state.search && liveTodos().some(isOverdue) ? `<div class="banner warn" role="status">${icon('alert')}<span>有 ${liveTodos().filter(isOverdue).length} 项逾期未完成，不计入今日待办，可在"计划 › 逾期"中查看。</span><span class="spacer" style="flex:1"></span><button class="btn sm ghost" data-action="view" data-view="plan">查看</button></div>` : ''}
      ${canAdd ? `
      <label class="quick-add">
        ${icon('plus')}
        <span class="sr-only">快速新建待办</span>
        <input id="quick-add" placeholder="添加待办，回车保存" maxlength="200" autocomplete="off">
        ${addHint ? `<span class="hint">${addHint}</span>` : ''}
        <kbd class="hint">Ctrl+N</kbd>
      </label>` : ''}
      <div class="main-scroll">${body}</div>
    </main>`;
}

function renderGroups(groups) {
  return groups.filter((g) => g.items.length).map((g) => {
    const collapsed = state.collapsedGroups.has(g.id);
    const head = g.title ? `
      <button class="group-title ${g.tone || ''}" data-action="toggle-group" data-id="${g.id}" aria-expanded="${!collapsed}">
        ${icon('chevronDown', 12)}${g.tone === 'overdue' ? icon('alert', 12) : ''}<span>${g.title}</span><span class="count">${g.items.length}</span>
      </button>` : '';
    return `<section class="group">${head}${collapsed ? '' : `<ul class="todo-list" role="listbox" aria-label="${g.title || '待办'}">${g.items.map(todoRow).join('')}</ul>`}</section>`;
  }).join('');
}

function emptyState() {
  const map = {
    today: ['sun', '今天没有到期的事项', '在上方输入框添加，或去"计划"看看接下来的安排。'],
    plan: ['calendar', '没有计划中的事项', '为待办设置截止日期后会出现在这里。'],
    all: ['inbox', '还没有待办', '在上方输入框写下第一件事。'],
    done: ['checkCircle', '还没有完成记录', '勾选待办前的圆圈即可标记完成。'],
    trash: ['trash', '回收站是空的', '删除的事项会在这里保留 30 天。'],
  };
  const [ic, h, p] = state.search ? ['search', '没有匹配的事项', '换个关键词试试。'] : map[state.view] || ['tag', '这个标签下没有未完成事项', '新建的待办会自动挂上当前标签。'];
  return `<div class="empty"><div class="badge">${icon(ic, 28)}</div><h2>${h}</h2><p>${p}</p></div>`;
}

/* ---------- 渲染：详情面板 ---------- */
function renderDetail() {
  const t = state.todos.find((x) => x.id === state.selected);
  if (!t || ['stats', 'tags', 'settings'].includes(state.view)) return '';
  const tags = t.tags.map(tagById).filter(Boolean);
  const dateText = t.date ? `${friendlyDate(t.date)}（${t.date}）${t.time ? ' ' + t.time : ' · 全天'}` : '';
  return `
    <aside class="detail" aria-label="待办详情">
      <div class="detail-head">
        <button class="check prio-${t.priority}" role="checkbox" aria-checked="${t.done}" aria-label="完成：${esc(t.title)}" data-action="toggle" data-id="${t.id}"><span class="ring">${icon('check', 12)}</span></button>
        <textarea class="detail-title" rows="2" maxlength="200" data-field="title" aria-label="标题">${esc(t.title)}</textarea>
        <button class="icon-btn" data-action="close-detail" aria-label="关闭详情（Esc）" title="关闭（Esc）">${icon('x')}</button>
      </div>
      <div class="detail-body">
        <div class="prop-list">
          <button class="prop" data-action="pop-date">
            <span class="k">${icon('calendar', 14)}日期</span>
            <span class="v ${t.date ? (isOverdue(t) ? 'overdue' : '') : 'placeholder'}">${t.date ? (isOverdue(t) ? '逾期 · ' : '') + dateText : '添加截止日期'}</span>${icon('chevronRight', 14, 'chev')}
          </button>
          <button class="prop" data-action="pop-repeat">
            <span class="k">${icon('repeat', 14)}循环</span>
            <span class="v ${t.repeat ? '' : 'placeholder'}">${esc(repeatSummary(t.repeat))}</span>${icon('chevronRight', 14, 'chev')}
          </button>
          <button class="prop" data-action="pop-reminder">
            <span class="k">${icon('bell', 14)}提醒</span>
            <span class="v ${t.reminders.length ? '' : 'placeholder'}">${t.reminders.length ? t.reminders.map((r) => reminderLabel(r, t)).join('、') : '添加提醒'}</span>${icon('chevronRight', 14, 'chev')}
          </button>
          <button class="prop" data-action="pop-tags">
            <span class="k">${icon('tag', 14)}标签</span>
            <span class="v ${tags.length ? '' : 'placeholder'}">${tags.length ? tags.map((tg) => `<span class="chip tc-${tg.color}" title="${esc(tagPath(tg.id))}"><span class="dot"></span><span>${esc(tagPath(tg.id))}</span></span>`).join('') : '添加标签'}</span>${icon('chevronRight', 14, 'chev')}
          </button>
        </div>
        <div>
          <span class="field-label" id="prio-label">优先级</span>
          <div class="seg" role="group" aria-labelledby="prio-label">
            ${[['none', '无'], ['low', '低'], ['medium', '中'], ['high', '高']].map(([v, l]) => `<button aria-pressed="${t.priority === v}" data-action="priority" data-val="${v}">${v !== 'none' ? `<span class="dot" style="background:var(--priority-${v})"></span>` : ''}${l}</button>`).join('')}
          </div>
        </div>
        ${t.repeat && !t.done ? `<div class="row" style="display:flex;gap:8px"><button class="btn sm" data-action="skip">${icon('skip', 14)}跳过本次</button><span class="help" style="align-self:center">下一次：${friendlyDate(nextOccurrences(addDays(t.date, 1), t.repeat, 1)[0])}</span></div>` : ''}
        <div>
          <label class="field-label" for="note">备注</label>
          <textarea id="note" class="textarea" data-field="note" placeholder="添加备注">${esc(t.note)}</textarea>
        </div>
      </div>
      <div class="detail-foot">
        <span>创建于 2026-10-28 · 自动保存</span>
        <button class="btn sm ghost" data-action="delete" data-id="${t.id}" style="color:var(--destructive)">${icon('trash', 14)}删除</button>
      </div>
    </aside>`;
}

/* ---------- 弹层 ---------- */
let pop = null;
function closePopover() { pop?.el.remove(); pop = null; }
function openPopover(anchor, html, kind) {
  closePopover();
  const el = document.createElement('div');
  el.className = 'popover'; el.setAttribute('role', 'dialog'); el.innerHTML = html;
  document.body.append(el);
  const r = anchor.getBoundingClientRect();
  const w = el.offsetWidth, h = el.offsetHeight;
  let left = r.left - w - 8; if (left < 8) left = Math.min(r.left, innerWidth - w - 8);
  let top = Math.min(r.top, innerHeight - h - 8);
  el.style.left = left + 'px'; el.style.top = Math.max(8, top) + 'px';
  pop = { el, kind, anchor };
  el.querySelector('input, select, button')?.focus();
  return el;
}
const current = () => state.todos.find((x) => x.id === state.selected);

function datePopover(anchor) {
  const t = current();
  const sel = t.date || TODAY;
  const m = state.calMonth || sel.slice(0, 7);
  const [y, mo] = m.split('-').map(Number);
  const first = new Date(y, mo - 1, 1);
  const ws = state.settings.weekStart;
  const startPad = (first.getDay() - ws + 7) % 7;
  const cells = [];
  for (let i = 0; i < 42; i++) { const d = new Date(y, mo - 1, 1 - startPad + i); cells.push(ymd(d)); }
  const wds = [...Array(7)].map((_, i) => WEEK[(i + ws) % 7]);
  const nextMon = addDays(TODAY, ((8 - parse(TODAY).getDay()) % 7) || 7);
  openPopover(anchor, `
    <div class="stack">
      <div class="quick-dates">
        <button data-pop="date" data-val="${TODAY}">${icon('sun')}今天</button>
        <button data-pop="date" data-val="${addDays(TODAY, 1)}">${icon('calendar')}明天</button>
        <button data-pop="date" data-val="${nextMon}">${icon('calendar')}下周一</button>
        <button data-pop="date" data-val="">${icon('x')}清除</button>
      </div>
      <div>
        <div class="cal-head"><button class="icon-btn" data-pop="month" data-val="-1" aria-label="上个月">${icon('chevronLeft')}</button><span>${y} 年 ${mo} 月</span><button class="icon-btn" data-pop="month" data-val="1" aria-label="下个月">${icon('chevronRight')}</button></div>
        <div class="cal" role="grid">
          ${wds.map((w) => `<span class="wd">${w}</span>`).join('')}
          ${cells.map((d) => `<button class="${d.slice(0, 7) !== m ? 'out' : ''} ${d === TODAY ? 'is-today' : ''}" aria-pressed="${t.date === d}" data-pop="date" data-val="${d}" aria-label="${d}">${Number(d.slice(8))}</button>`).join('')}
        </div>
      </div>
      <label class="check-row"><input type="checkbox" data-pop="allday" ${!t.time ? 'checked' : ''}>全天</label>
      <div class="row"><label class="field-label" for="pop-time" style="margin:0;width:40px">时间</label><input id="pop-time" type="time" class="input" data-pop="time" value="${t.time || '09:00'}" ${!t.time ? 'disabled' : ''}></div>
    </div>`, 'date');
}

function repeatPopover(anchor) {
  const t = current();
  const r = t.repeat || { type: 'none', interval: 1, days: [], monthDay: Number((t.date || TODAY).slice(8)), end: { type: 'never' } };
  const wdOrder = [1, 2, 3, 4, 5, 6, 0];
  const preview = t.repeat ? nextOccurrences(t.date || TODAY, t.repeat, 5) : [];
  openPopover(anchor, `
    <div class="stack" style="width:288px">
      <h3>循环</h3>
      <div class="row">
        <select class="select" data-pop="rtype" aria-label="循环类型">
          ${[['none', '不重复'], ['daily', '每天'], ['weekdays', '工作日'], ['weekly', '每周'], ['monthly', '每月'], ['yearly', '每年']].map(([v, l]) => `<option value="${v}" ${r.type === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </div>
      ${['daily', 'weekly', 'monthly', 'yearly'].includes(r.type) ? `
      <div class="row"><span class="help">每</span><input type="number" min="1" max="99" class="input" style="width:72px" data-pop="interval" value="${r.interval}" aria-label="间隔"><span class="help">${{ daily: '天', weekly: '周', monthly: '月', yearly: '年' }[r.type]}</span></div>` : ''}
      ${r.type === 'weekly' ? `<div class="weekdays" role="group" aria-label="星期">${wdOrder.map((d) => `<button aria-pressed="${(r.days || []).includes(d)}" data-pop="wd" data-val="${d}" aria-label="周${WEEK[d]}">${WEEK[d]}</button>`).join('')}</div>` : ''}
      ${r.type === 'monthly' ? `<div class="row"><span class="help">日期</span><select class="select" data-pop="mday" aria-label="每月日期">${[...Array(31)].map((_, i) => `<option value="${i + 1}" ${r.monthDay === i + 1 ? 'selected' : ''}>${i + 1} 日</option>`).join('')}<option value="last" ${r.monthDay === 'last' ? 'selected' : ''}>最后一天</option></select></div><p class="help" style="margin:0">当月没有该日期时，落在当月最后一天。</p>` : ''}
      ${r.type !== 'none' ? `
      <div><span class="field-label">结束</span>
        <select class="select" data-pop="end" aria-label="结束条件">
          <option value="never" ${r.end.type === 'never' ? 'selected' : ''}>永不</option>
          <option value="date" ${r.end.type === 'date' ? 'selected' : ''}>于 2026-12-31</option>
          <option value="count" ${r.end.type === 'count' ? 'selected' : ''}>重复 10 次后</option>
        </select></div>
      <div class="summary">${esc(repeatSummary(t.repeat))}</div>
      <div><span class="field-label">接下来 5 次</span><ol class="preview-dates">${preview.map((d) => `<li>${d}（周${WEEK[parse(d).getDay()]}）</li>`).join('')}</ol></div>` : ''}
    </div>`, 'repeat');
}

function reminderPopover(anchor) {
  const t = current();
  if (!t.date) {
    openPopover(anchor, `<div class="stack" style="width:260px"><h3>提醒</h3><p class="help" style="margin:0">相对提醒需要先设置截止日期。</p><button class="btn sm primary" data-pop="need-date">设置日期</button></div>`, 'reminder');
    return;
  }
  const opts = t.time ? REMINDER_OPTIONS : REMINDER_OPTIONS.filter((o) => [0, 1440].includes(o.min));
  openPopover(anchor, `
    <div class="stack" style="width:260px">
      <h3>提醒 <span class="help">（最多 5 个）</span></h3>
      <div>${opts.map((o) => `<label class="check-row"><input type="checkbox" data-pop="rem" value="${o.min}" ${t.reminders.some((r) => r.min === o.min) ? 'checked' : ''}>${reminderLabel(o, t)}</label>`).join('')}</div>
      ${!t.time ? `<p class="help" style="margin:0">全天事项按"全天事项默认提醒时间"（${state.settings.allDayTime}）提醒，可在设置中修改。</p>` : ''}
      <p class="help" style="margin:0">提醒通过系统通知推送，可在通知中直接「完成」或「稍后提醒」。</p>
    </div>`, 'reminder');
}

function tagsPopover(anchor, q = '') {
  const t = current();
  const ql = q.trim().toLowerCase();
  const list = state.tags.filter((tg) => !ql || tagPath(tg.id).toLowerCase().includes(ql));
  const ordered = [];
  const walk = (p) => children(p).forEach((c) => { if (list.includes(c)) ordered.push(c); walk(c.id); });
  walk(null);
  const exact = state.tags.some((tg) => tg.name.toLowerCase() === ql);
  const el = openPopover(anchor, `
    <div class="stack" style="width:280px">
      <input class="input" placeholder="搜索或新建标签" data-pop="tagq" value="${esc(q)}" aria-label="搜索标签">
      <div style="max-height:260px;overflow:auto">
        ${ordered.map((tg) => `<label class="check-row tc-${tg.color}" style="padding-left:${8 + (ql ? 0 : depthOf(tg.id) * 16)}px"><input type="checkbox" data-pop="tag" value="${tg.id}" ${t.tags.includes(tg.id) ? 'checked' : ''} ${!t.tags.includes(tg.id) && t.tags.length >= 10 ? 'disabled' : ''}><span class="dot"></span>${esc(ql ? tagPath(tg.id) : tg.name)}</label>`).join('') || '<p class="help">没有匹配的标签</p>'}
      </div>
      ${ql && !exact ? `<button class="btn sm" data-pop="newtag" data-val="${esc(q.trim())}">${icon('plus', 14)}新建标签"${esc(q.trim())}"</button>` : ''}
      <p class="help" style="margin:0">已选 ${t.tags.length} / 10</p>
    </div>`, 'tags');
  const input = el.querySelector('[data-pop="tagq"]');
  input.focus(); input.setSelectionRange(q.length, q.length);
}

function reopenPopover() {
  if (!pop) return;
  const anchor = document.querySelector(`[data-action="pop-${pop.kind}"]`) || pop.anchor;
  ({ date: datePopover, repeat: repeatPopover, reminder: reminderPopover, tags: tagsPopover })[pop.kind](anchor);
}

/* ---------- 标签管理 ---------- */
function renderTagManager() {
  const live = liveTodos();
  const rows = [];
  const walk = (p, depth) => children(p).forEach((tg) => {
    const n = live.filter((t) => t.tags.includes(tg.id)).length;
    const renaming = state.renaming === tg.id;
    rows.push(`
      <div class="tag-row tc-${tg.color}" draggable="true" data-id="${tg.id}" style="padding-left:${12 + depth * 24}px">
        <span class="handle" title="拖动以排序或调整层级" aria-hidden="true">${icon('grip', 14)}</span>
        <span class="name">
          <span class="dot"></span>
          ${renaming ? `<input class="input" data-rename="${tg.id}" value="${esc(tg.name)}" maxlength="30" aria-label="标签名称">` : `<span>${esc(tg.name)}</span>`}
          ${depth > 0 ? `<span class="depth-hint">L${depth + 1}</span>` : ''}
        </span>
        <span class="count">${n} 项</span>
        <span class="acts">
          <button class="icon-btn" data-action="tag-rename" data-id="${tg.id}" aria-label="重命名 ${esc(tg.name)}" title="重命名（F2）">${icon('pencil', 14)}</button>
          <button class="icon-btn" data-action="tag-color" data-id="${tg.id}" aria-label="修改颜色" title="颜色">${icon('palette', 14)}</button>
          <button class="icon-btn" data-action="tag-add-child" data-id="${tg.id}" aria-label="新建子标签" title="新建子标签" ${depth >= 4 ? 'disabled style="opacity:.4;cursor:not-allowed"' : ''}>${icon('plus', 14)}</button>
          <button class="icon-btn" data-action="tag-merge" data-id="${tg.id}" aria-label="合并到其他标签" title="合并">${icon('merge', 14)}</button>
          <button class="icon-btn danger" data-action="tag-delete" data-id="${tg.id}" aria-label="删除 ${esc(tg.name)}" title="删除（Delete）">${icon('trash', 14)}</button>
        </span>
      </div>`);
    walk(tg.id, depth + 1);
  });
  walk(null, 0);
  return `
    <main class="main" aria-label="标签管理">
      <header class="main-header">
        <div><h1>标签管理</h1><div class="sub">共 ${state.tags.length} 个标签 · 最多 5 级 · 拖动行到另一标签上可调整层级</div></div>
        <span class="spacer"></span>
        <button class="btn primary" data-action="tag-add-root">${icon('plus', 14)}新建标签</button>
      </header>
      <div class="main-scroll">
        <div class="tag-table" role="tree" aria-label="标签树">${rows.join('')}</div>
        <div class="tag-row" data-drop-root style="margin-top:8px;border:1px dashed var(--border-strong);border-radius:var(--radius-md);color:var(--foreground-subtle);justify-content:center">拖到这里成为根标签</div>
      </div>
    </main>`;
}

/* ---------- 统计 ---------- */
function statsPeriod() {
  const tab = state.statsTab, off = state.statsOffset;
  if (tab === 'day') { const d = addDays(TODAY, off); return { from: d, to: d, label: off === 0 ? '今天' : off === -1 ? '昨天' : d, unit: '天', prevFrom: addDays(d, -1), prevTo: addDays(d, -1), prevName: off === 0 ? '昨天' : '前一天' }; }
  if (tab === 'week') { const s = addDays(weekStartOf(TODAY), off * 7); const e = addDays(s, 6); return { from: s, to: e, label: off === 0 ? '本周' : off === -1 ? '上周' : `${s.slice(5)} ~ ${e.slice(5)}`, unit: '周', prevFrom: addDays(s, -7), prevTo: addDays(s, -1), prevName: '上周同期' }; }
  const base = parse(TODAY); const m = new Date(base.getFullYear(), base.getMonth() + off, 1);
  const s = ymd(m); const e = ymd(new Date(m.getFullYear(), m.getMonth() + 1, 0));
  const pm = new Date(m.getFullYear(), m.getMonth() - 1, 1);
  return { from: s, to: e, label: off === 0 ? '本月' : `${m.getFullYear()} 年 ${m.getMonth() + 1} 月`, unit: '月', prevFrom: ymd(pm), prevTo: ymd(new Date(m.getFullYear(), m.getMonth(), 0)), prevName: '上月同期' };
}
function allLogs() {
  const live = state.todos.filter((t) => t.done && t.doneAt).map((t) => ({ title: t.title, tag: t.tags[0] || null, at: t.doneAt }));
  return [...state.logs, ...live];
}
const countOn = (logs, d) => logs.filter((l) => l.at.startsWith(d)).length;
function streaks(logs) {
  const days = new Set(logs.map((l) => l.at.slice(0, 10)));
  let cur = 0; let d = days.has(TODAY) ? TODAY : addDays(TODAY, -1);
  while (days.has(d)) { cur++; d = addDays(d, -1); }
  let best = 0, run = 0; const sorted = [...days].sort();
  sorted.forEach((x, i) => { run = i && diffDays(x, sorted[i - 1]) === 1 ? run + 1 : 1; best = Math.max(best, run); });
  return { cur, best, last7: [...Array(7)].map((_, i) => { const day = addDays(TODAY, i - 6); return { day, on: days.has(day) }; }) };
}
// 平滑曲线（Catmull-Rom → 三次贝塞尔）
function smooth(pts) {
  if (pts.length < 2) return '';
  let p = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    p += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
  }
  return p;
}
function ring(pct, size = 88, stroke = 9) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--primary-soft)" stroke-width="${stroke}"/>
    ${pct > 0 ? `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--primary)" stroke-width="${stroke}" stroke-linecap="round"
      stroke-dasharray="${(c * pct) / 100} ${c}" transform="rotate(-90 ${size / 2} ${size / 2})"/>` : ''}</svg>`;
}
function donut(segs, size = 132, stroke = 18) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, total = segs.reduce((n, s) => n + s.v, 0) || 1;
  let acc = 0; const gap = segs.length > 1 ? 2 : 0;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--surface-sunken)" stroke-width="${stroke}"/>
    ${segs.map((s) => { const len = (c * s.v) / total; const el = `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${stroke}" stroke-dasharray="${Math.max(len - gap, 0.5)} ${c}" stroke-dashoffset="${-acc}" transform="rotate(-90 ${size / 2} ${size / 2})"/>`; acc += len; return el; }).join('')}
  </svg>`;
}
const heatLevel = (n, max) => (n <= 0 ? 0 : Math.min(4, Math.ceil((n / Math.max(max, 1)) * 4)));

// 周：平滑面积折线 + 上周虚线对比
function weekTrend(p, logs) {
  const days = [...Array(7)].map((_, i) => addDays(p.from, i));
  const cur = days.map((d) => ({ d, v: countOn(logs, d), future: d > TODAY }));
  const prev = days.map((_, i) => countOn(logs, addDays(p.prevFrom, i)));
  const max = Math.max(4, ...cur.map((x) => x.v), ...prev);
  const W = 680, H = 220, L = 32, R = 20, T = 28, B = 28;
  const x = (i) => L + (i * (W - L - R)) / 6, y = (v) => T + (1 - v / max) * (H - T - B);
  const past = cur.filter((c) => !c.future);
  const pts = past.map((c, i) => [x(i), y(c.v)]);
  const prevPts = prev.map((v, i) => [x(i), y(v)]);
  const area = pts.length > 1 ? `${smooth(pts)} L${pts[pts.length - 1][0]},${H - B} L${pts[0][0]},${H - B} Z` : '';
  const ticks = [0, Math.round(max / 2), max];
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${p.label}每天完成数折线图，虚线为前一周">
    <defs><linearGradient id="area-grad" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--chart-area-from)"/><stop offset="1" stop-color="var(--chart-area-to)"/></linearGradient></defs>
    ${ticks.map((t) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text x="${L - 8}" y="${y(t) + 4}" text-anchor="end">${t}</text>`).join('')}
    <path d="${smooth(prevPts)}" class="line-prev"/>
    ${area ? `<path d="${area}" fill="url(#area-grad)"/>` : ''}
    ${pts.length > 1 ? `<path d="${smooth(pts)}" class="line-cur"/>` : ''}
    ${cur.map((c, i) => `
      <g class="pt" tabindex="${c.future ? -1 : 0}">
        <title>${c.d} 周${WEEK[parse(c.d).getDay()]}：${c.future ? '未到' : `完成 ${c.v} 项`} · 前一周同日 ${prev[i]} 项</title>
        ${c.future ? `<circle cx="${x(i)}" cy="${H - B}" r="3" class="dot-future"/>` : `<circle cx="${x(i)}" cy="${y(c.v)}" r="${c.d === TODAY ? 6 : 4.5}" class="dot ${c.d === TODAY ? 'today' : ''}"/><text class="val" x="${x(i)}" y="${y(c.v) - 12}" text-anchor="middle">${c.v}</text>`}
        <text x="${x(i)}" y="${H - 8}" text-anchor="middle" class="${c.d === TODAY ? 'xl-today' : ''}">${c.d === TODAY ? '今天' : '周' + WEEK[parse(c.d).getDay()]}</text>
      </g>`).join('')}
  </svg>
  <div class="legend"><span><i class="sw line"></i>${p.label}</span><span><i class="sw dash"></i>${state.statsOffset === 0 ? '上周' : '前一周'}</span></div>`;
}

// 月：日历热力图
function monthHeatmap(p, logs) {
  const ws = state.settings.weekStart;
  const pad = (parse(p.from).getDay() - ws + 7) % 7;
  const days = diffDays(p.to, p.from) + 1;
  const counts = [...Array(days)].map((_, i) => countOn(logs, addDays(p.from, i)));
  const max = Math.max(...counts, 1);
  const cells = [];
  for (let i = 0; i < pad; i++) cells.push('<div class="hm-cell blank" aria-hidden="true"></div>');
  counts.forEach((n, i) => {
    const d = addDays(p.from, i);
    const future = d > TODAY;
    cells.push(`<div class="hm-cell ${future ? 'future' : `lv${heatLevel(n, max)}`} ${d === TODAY ? 'is-today' : ''}" role="gridcell" tabindex="${future ? -1 : 0}" title="${d}：${future ? '未到' : `完成 ${n} 项`}" aria-label="${d} ${future ? '未到' : `完成 ${n} 项`}">
      <span class="dd">${i + 1}</span>${!future && n ? `<span class="nn">${n}</span>` : ''}</div>`);
  });
  return `
    <div class="hm" role="grid" aria-label="${p.label}每日完成热力图">
      ${[...Array(7)].map((_, i) => `<div class="hm-wd">周${WEEK[(i + ws) % 7]}</div>`).join('')}
      ${cells.join('')}
    </div>
    <div class="legend"><span>少</span>${[0, 1, 2, 3, 4].map((l) => `<i class="hm-sw lv${l}"></i>`).join('')}<span>多</span><span class="help">· 格内右下角数字为当天完成数</span></div>`;
}

// 日：小时分布条 + 完成时间线
function dayTimeline(cur) {
  const hours = [...Array(24)].map((_, h) => cur.filter((l) => Number(l.at.slice(11, 13)) === h).length);
  const max = Math.max(...hours, 1);
  const items = [...cur].sort((a, b) => a.at.localeCompare(b.at));
  return `
    <div class="hour-strip" role="img" aria-label="按小时分布">
      ${hours.map((n, h) => `<div class="hs-cell lv${heatLevel(n, max)}" title="${h}:00–${h + 1}:00 完成 ${n} 项"></div>`).join('')}
    </div>
    <div class="hour-axis"><span>0:00</span><span>6:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div>
    ${items.length ? `<ol class="timeline">${items.map((l) => { const tg = l.tag && tagById(l.tag); return `<li><time class="num">${l.at.slice(11)}</time><span class="node">${icon('check', 10)}</span><span class="tl-title">${esc(l.title)}</span>${tg ? `<span class="chip tc-${tg.color}"><span class="dot"></span><span>${esc(tg.name)}</span></span>` : ''}</li>`; }).join('')}</ol>`
      : `<div class="empty" style="padding:32px"><div class="badge">${icon('clock', 24)}</div><h2>这一天还没有完成记录</h2></div>`}`;
}

function renderStats() {
  const p = statsPeriod();
  const logs = allLogs();
  const inRange = (l, a, b) => l.at.slice(0, 10) >= a && l.at.slice(0, 10) <= b;
  const cur = logs.filter((l) => inRange(l, p.from, p.to)).sort((a, b) => b.at.localeCompare(a.at));
  const days = diffDays(p.to, p.from) + 1;
  const elapsed = Math.max(1, Math.min(days, diffDays(TODAY, p.from) + 1));
  // 本期未结束时与上期"同期"（相同天数）比较，避免拿 1 天对比 7 天
  const prevEnd = [addDays(p.prevFrom, elapsed - 1), p.prevTo].sort()[0];
  const prev = logs.filter((l) => inRange(l, p.prevFrom, prevEnd));
  const delta = cur.length - prev.length;
  const due = liveTodos().filter((t) => t.date && t.date >= p.from && t.date <= p.to);
  const dueDone = due.filter((t) => t.done).length;
  const pct = due.length ? Math.round((dueDone / due.length) * 100) : null;
  const st = streaks(logs);
  let best = null;
  for (let i = 0; i < elapsed; i++) { const d = addDays(p.from, i); const n = countOn(cur, d); if (!best || n > best.n) best = { d, n }; }
  const hourCounts = [...Array(24)].map((_, h) => cur.filter((l) => Number(l.at.slice(11, 13)) === h).length);
  const peak = hourCounts.indexOf(Math.max(...hourCounts));

  // 标签分布（按根标签）
  const rootOf = (id) => { let t = tagById(id); while (t && t.parent) t = tagById(t.parent); return t; };
  const dist = {};
  for (const l of cur) { const r = l.tag ? rootOf(l.tag) : null; const k = r ? r.id : 'none'; dist[k] = (dist[k] || 0) + 1; }
  const segs = Object.entries(dist).sort((a, b) => b[1] - a[1]).map(([k, v]) => { const tg = tagById(k); return { v, name: tg ? tg.name : '无标签', color: tg ? `var(--tag-${tg.color}-fg)` : 'var(--control-border)' }; });

  const main = state.statsTab === 'week' ? `<div class="panel chart"><h2>每日完成趋势<span class="help">虚线为前一周，悬停圆点查看同日对比</span></h2>${weekTrend(p, logs)}</div>`
    : state.statsTab === 'month' ? `<div class="panel"><h2>完成日历<span class="help">颜色越深，完成越多</span></h2>${monthHeatmap(p, logs)}</div>`
    : `<div class="panel"><h2>完成时间线<span class="help">${cur.length ? `最活跃时段 ${peak}:00–${peak + 1}:00` : ''}</span></h2>${dayTimeline(cur)}</div>`;

  const byDay = {};
  for (const l of cur) (byDay[l.at.slice(0, 10)] ||= []).push(l);
  const deltaText = delta > 0 ? `↑ ${delta}` : delta < 0 ? `↓ ${-delta}` : '持平';

  return `
    <main class="main" aria-label="统计">
      <header class="main-header">
        <div><h1>统计</h1><div class="sub">${p.from === p.to ? `${p.from} 周${WEEK[parse(p.from).getDay()]}` : `${p.from} ~ ${p.to}`}</div></div>
        <span class="spacer"></span>
        <div class="seg" role="group" aria-label="统计维度">
          ${[['day', '日'], ['week', '周'], ['month', '月']].map(([v, l]) => `<button aria-pressed="${state.statsTab === v}" data-action="stats-tab" data-val="${v}">${l}</button>`).join('')}
        </div>
        <div class="period-nav">
          <button class="icon-btn" data-action="stats-nav" data-val="-1" aria-label="上一${p.unit}">${icon('chevronLeft')}</button>
          <span class="period">${p.label}</span>
          <button class="icon-btn" data-action="stats-nav" data-val="1" aria-label="下一${p.unit}" ${state.statsOffset >= 0 ? 'disabled' : ''}>${icon('chevronRight')}</button>
          ${state.statsOffset ? '<button class="btn sm ghost" data-action="stats-nav" data-val="0">回到本期</button>' : ''}
        </div>
      </header>
      <div class="main-scroll">
        <div class="stats-hero">
          <section class="hero-card hero-main" aria-label="完成数">
            <div class="k">${/\d/.test(p.label) ? p.label + ' ' : p.label}完成</div>
            <div class="hero-num"><span class="num">${cur.length}</span><span class="unit">项</span>
              <span class="pill ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}" title="${p.prevName} ${prev.length} 项">${deltaText}<span class="sr-only">，与${p.prevName}相比</span></span>
            </div>
            <div class="hero-sub">${state.statsTab === 'day'
              ? `${p.prevName} ${prev.length} 项${cur.length ? ` · 最活跃 ${peak}:00–${peak + 1}:00` : ''}`
              : `日均 <b class="num">${(cur.length / elapsed).toFixed(1)}</b> 项 · 最多 <b>${best && best.n ? `${friendlyDate(best.d)} ${best.n} 项` : '—'}</b> · ${p.prevName} ${prev.length} 项`}</div>
          </section>
          <section class="hero-card hero-ring" aria-label="到期完成率">
            <div class="ring-wrap">${ring(pct ?? 0)}<span class="ring-txt num">${pct == null ? '—' : pct + '%'}</span></div>
            <div><div class="k">到期完成率</div><div class="hero-sub">${due.length ? `截止在${/\d/.test(p.label) ? ' ' + p.label + ' ' : p.label}的 ${due.length} 项中<br>已完成 ${dueDone} 项` : `${p.label}没有到期事项`}</div></div>
          </section>
          <section class="hero-card hero-streak" aria-label="连续完成天数">
            <div class="k">连续完成</div>
            <div class="hero-num"><span class="num">${st.cur}</span><span class="unit">天</span></div>
            <div class="streak-dots" aria-label="最近 7 天">${st.last7.map((x) => `<span class="sd ${x.on ? 'on' : ''} ${x.day === TODAY ? 'today' : ''}" title="${x.day}${x.on ? ' 有完成' : ' 无完成'}">${WEEK[parse(x.day).getDay()]}</span>`).join('')}</div>
            <div class="hero-sub">最长纪录 ${st.best} 天</div>
          </section>
        </div>
        ${main}
        <div class="${state.statsTab === 'day' ? '' : 'two-col'}">
          <div class="panel"><h2>按标签分布<span class="help">按根标签汇总</span></h2>
            ${segs.length ? `<div class="donut-wrap">
              <div class="donut">${donut(segs)}<div class="donut-center"><b class="num">${cur.length}</b><span>项</span></div></div>
              <ul class="donut-legend">${segs.map((s) => `<li><span class="dot" style="background:${s.color}"></span><span class="nm">${esc(s.name)}</span><span class="num">${s.v}</span><span class="pc num">${Math.round((s.v / cur.length) * 100)}%</span></li>`).join('')}</ul>
            </div>` : '<p class="help">暂无数据</p>'}
          </div>
          ${state.statsTab === 'day' ? '' : `<div class="panel"><h2>完成明细<span class="help">${cur.length} 条</span></h2>
            ${cur.length ? `<div class="log-groups">${Object.entries(byDay).slice(0, 14).map(([d, ls]) => `
              <div class="lg-day">${state.statsTab === 'day' ? '' : `<div class="lg-head">${friendlyDate(d)}<span>${d.slice(5)} · ${ls.length} 项</span></div>`}
                <ul class="log-list">${ls.map((l) => { const tg = l.tag && tagById(l.tag); return `<li><span class="t">${l.at.slice(11)}</span><span class="ok">${icon('checkCircle', 14)}</span><span class="lt">${esc(l.title)}</span>${tg ? `<span class="chip tc-${tg.color}"><span class="dot"></span><span>${esc(tg.name)}</span></span>` : ''}</li>`; }).join('')}</ul>
              </div>`).join('')}</div>` : '<p class="help">本期还没有完成记录</p>'}
          </div>`}
        </div>
      </div>
    </main>`;
}

/* ---------- 设置 ---------- */
function renderSettings() {
  const s = state.settings;
  const sw = (key, label, desc) => `<div class="setting"><div class="txt"><b id="l-${key}">${label}</b><span>${desc}</span></div><button class="switch" role="switch" aria-checked="${s[key]}" aria-labelledby="l-${key}" data-action="set-toggle" data-key="${key}"></button></div>`;
  const sel = (key, label, desc, opts) => `<div class="setting"><div class="txt"><b>${label}</b><span>${desc}</span></div><select class="select" data-set="${key}" aria-label="${label}">${opts.map(([v, l]) => `<option value="${v}" ${String(s[key]) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`;
  return `
    <main class="main" aria-label="设置">
      <header class="main-header">
        <div><h1>设置</h1><div class="sub">修改即时生效</div></div>
      </header>
      <div class="main-scroll settings">
        <section><h2>通用</h2><div class="setting-card">
          ${sw('autostart', '开机自启', '登录系统后在后台启动，只显示托盘与悬浮窗')}
          ${sel('closeAction', '关闭主窗口时', '选择"最小化到托盘"可继续接收提醒', [['tray', '最小化到托盘'], ['quit', '退出程序']])}
          ${sel('weekStart', '每周起始日', '影响日期选择器、"本周"分组与周统计', [[1, '周一'], [0, '周日']])}
        </div></section>
        <section><h2>外观</h2><div class="setting-card">
          <div class="setting"><div class="txt"><b>主题</b><span>跟随系统时会随 Windows 的浅色 / 深色设置自动切换</span></div>
            <div class="seg" role="group" aria-label="主题">
              ${[['light', 'sun', '浅色'], ['dark', 'moon', '深色'], ['system', 'laptop', '跟随系统']].map(([v, ic, l]) => `<button aria-pressed="${s.theme === v}" data-action="theme" data-val="${v}">${icon(ic, 14)}${l}</button>`).join('')}
            </div></div>
          ${sw('gpu', '硬件加速', '使用显卡渲染界面，滚动与动画更流畅；关闭可减少约 10–20 MB 常驻内存。修改后需重启')}
          ${s.gpu ? `<div class="setting restart-hint" role="status"><div class="txt"><b>${icon('info', 14)}重启后生效</b><span>当前仍未使用硬件加速，重启 XTodoY 后切换</span></div><button class="btn primary" data-action="toast" data-msg="（原型）XTodoY 将重启">${icon('restore', 14)}立即重启</button></div>` : ''}
        </div></section>
        <section><h2>提醒</h2><div class="setting-card">
          <div class="setting"><div class="txt"><b>系统通知权限</b><span>XTodoY 通过 Windows 通知中心推送提醒</span></div><span class="status-ok">${icon('checkCircle', 14)}已允许</span></div>
          ${sel('defaultReminder', '默认提醒', '新建带时间的事项时自动添加', [[-1, '不提醒'], [0, '准时'], [5, '提前 5 分钟'], [15, '提前 15 分钟'], [30, '提前 30 分钟']])}
          <div class="setting"><div class="txt"><b>全天事项默认提醒时间</b><span>全天事项"准时"提醒在当天这个时间触发</span></div><input type="time" class="input" data-set="allDayTime" value="${s.allDayTime}" aria-label="全天事项默认提醒时间"></div>
          ${sel('snooze', '稍后提醒时长', '在通知中点击「稍后提醒」后再次提醒的间隔', [[5, '5 分钟'], [10, '10 分钟'], [15, '15 分钟'], [30, '30 分钟'], [60, '60 分钟']])}
          ${sw('sound', '提醒声音', '使用系统默认通知声音')}
          ${sw('inAppPopup', '同时显示应用内提醒窗口', '系统通知被勿扰模式屏蔽时作为补充')}
        </div></section>
        <section><h2>悬浮窗</h2><div class="setting-card">
          ${sw('floating', '显示悬浮窗', '桌面置顶显示今日未完成数量，单击打开主窗口')}
          ${sel('floatingOpacity', '透明度', '', [[100, '100%'], [80, '80%'], [60, '60%']])}
          ${sw('floatingLock', '锁定位置', '锁定后无法拖动')}
          <div class="setting"><div class="txt"><b>重置位置</b><span>移回主显示器右下角</span></div><button class="btn" data-action="toast" data-msg="悬浮窗已移回右下角">重置</button></div>
        </div></section>
        <section><h2>数据</h2><div class="setting-card">
          <div class="setting"><div class="txt"><b>导出备份</b><span>导出全部事项、标签、提醒、完成记录与设置为 JSON</span></div><button class="btn" data-action="toast" data-msg="已导出到 XTodoY-backup-2026-11-02.json">${icon('download', 14)}导出</button></div>
          <div class="setting"><div class="txt"><b>导入备份</b><span>将覆盖当前数据，覆盖前会自动备份</span></div><button class="btn" data-action="import">${icon('upload', 14)}导入…</button></div>
          <div class="setting"><div class="txt"><b>自动备份</b><span>每天首次启动时备份，保留最近 7 份 · 最近一次：今天 08:01</span></div><button class="btn ghost" data-action="toast" data-msg="已打开数据目录">${icon('folder', 14)}打开数据目录</button></div>
        </div></section>
        ${renderUpdateSection()}
        <section><h2>关于</h2><div class="setting-card">
          <div class="setting"><div class="txt"><b>XTodoY</b><span>版本 ${state.update.current}（原型）· 数据仅保存在本机</span></div><a href="https://github.com/AhDaii/XTodoY" target="_blank" rel="noopener">项目主页</a></div>
        </div></section>
      </div>
    </main>`;
}

/* ---------- 更新（SRS F10 / UI-17） ---------- */
function updateBadge() {
  const u = state.update;
  if (u.skipped) return null;
  return u.phase === 'available' ? `新版本 ${u.latest} 可用` : u.phase === 'ready' ? '更新已就绪，重启后生效' : null;
}
function renderUpdateSection() {
  const u = state.update, s = state.settings;
  const downloaded = ((u.size * u.progress) / 100).toFixed(1);
  const status = {
    latest: { ic: 'checkCircle', tone: 'ok', title: '已是最新版本', sub: `XTodoY ${u.current} · 上次检查：${u.lastCheck}`, acts: `<button class="btn" data-action="upd-check">${icon('restore', 14)}检查更新</button>` },
    checking: { ic: null, tone: '', title: '正在检查更新…', sub: '正在连接 GitHub Releases', acts: '' },
    available: { ic: 'download', tone: 'info', title: `发现新版本 ${u.latest}`, sub: `${RELEASE_NOTES.date} 发布 · ${u.size} MB${u.skipped ? ' · 已跳过此版本' : ''}`, acts: `<button class="btn" data-action="upd-details">查看更新内容</button><button class="btn primary" data-action="upd-download">${icon('download', 14)}立即更新</button>` },
    downloading: { ic: 'download', tone: 'info', title: `正在下载 ${u.latest}`, sub: `<span class="num">${u.progress}%</span> · ${downloaded} / ${u.size} MB · 下载期间可以继续使用`, acts: `<button class="btn" data-action="upd-cancel">取消下载</button>`, progress: true },
    ready: { ic: 'checkCircle', tone: 'info', title: '更新已就绪', sub: `${u.latest} 已下载并通过校验。重启后生效；不重启的话，下次退出程序时会自动安装`, acts: `<button class="btn" data-action="upd-details">查看更新内容</button><button class="btn primary" data-action="upd-restart">${icon('restore', 14)}立即重启并更新</button>` },
    error: { ic: 'alert', tone: 'err', title: '检查更新失败', sub: u.error || '无法连接更新服务器，请检查网络后重试', acts: `<a class="btn ghost" href="https://github.com/AhDaii/XTodoY/releases" target="_blank" rel="noopener">前往下载页</a><button class="btn" data-action="upd-check">重试</button>` },
  }[u.phase];
  return `
    <section><h2>更新</h2><div class="setting-card">
      <div class="update-status ${status.tone}" role="status" aria-live="polite">
        <span class="us-icon">${status.ic ? icon(status.ic, 20) : '<span class="spinner" aria-hidden="true"></span>'}</span>
        <div class="txt"><b>${status.title}</b><span>${status.sub}</span>
          ${status.progress ? `<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${u.progress}" aria-label="下载进度"><i style="width:${u.progress}%"></i></div>` : ''}
        </div>
        <div class="us-acts">${status.acts}</div>
      </div>
      <div class="setting"><div class="txt"><b id="l-autoCheck">自动检查更新</b><span>启动后及每 24 小时检查一次；关闭后只在手动检查时联网</span></div><button class="switch" role="switch" aria-checked="${s.autoCheck}" aria-labelledby="l-autoCheck" data-action="set-toggle" data-key="autoCheck"></button></div>
      <div class="setting ${s.autoCheck ? '' : 'is-disabled'}"><div class="txt"><b id="l-autoDownload">自动下载更新</b><span>在后台下载，完成后提示重启；不重启则在退出程序时安装</span></div><button class="switch" role="switch" aria-checked="${s.autoCheck && s.autoDownload}" aria-labelledby="l-autoDownload" data-action="set-toggle" data-key="autoDownload" ${s.autoCheck ? '' : 'disabled'}></button></div>
      <div class="setting"><div class="txt"><b>更新通道</b><span>测试版可提前体验新功能，可能不稳定；切回稳定版不会降级</span></div><select class="select" data-set="channel" aria-label="更新通道"><option value="stable" ${s.channel === 'stable' ? 'selected' : ''}>稳定版</option><option value="beta" ${s.channel === 'beta' ? 'selected' : ''}>测试版</option></select></div>
    </div></section>`;
}
function updateDialog() {
  const u = state.update;
  const ready = u.phase === 'ready';
  const after = u.justUpdated;
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `
    <div class="dialog update-dialog" role="dialog" aria-modal="true" aria-labelledby="upd-title">
      <div class="ud-head">${logo(40)}<div><h2 id="upd-title">XTodoY ${after ? u.current : u.latest}</h2>
        <p>${after ? '已安装' : `当前版本 ${u.current}`} · ${RELEASE_NOTES.date} 发布${after ? '' : ` · ${u.size} MB`}</p></div></div>
      <h3>更新内容</h3>
      <ul class="release-notes">${RELEASE_NOTES.items.map(([k, t]) => `<li><span class="rn-tag rn-${{ 新增: 'new', 改进: 'imp', 修复: 'fix' }[k]}">${k}</span><span>${t}</span></li>`).join('')}</ul>
      ${after ? '' : `<p class="help">${ready ? '安装包已通过 SHA-512 校验。' : ''}更新前会自动备份数据，重启期间错过的提醒会在启动后补发。</p>`}
      <div class="actions">
        ${after ? '<button class="btn primary" data-dlg="close">知道了</button>' : `
        ${u.skipped ? '' : '<button class="btn ghost ud-skip" data-dlg="skip">跳过此版本</button>'}
        <button class="btn" data-dlg="later">稍后</button>
        <button class="btn primary" data-dlg="${ready ? 'restart' : 'download'}">${ready ? '立即重启并更新' : '立即更新'}</button>`}
      </div>
    </div>`;
  document.body.append(ov);
  const close = () => ov.remove();
  ov.addEventListener('click', (e) => {
    if (e.target === ov) return close();
    const b = e.target.closest('[data-dlg]');
    if (!b) return;
    const k = b.dataset.dlg;
    close();
    if (k === 'skip') { u.skipped = true; render(); toast(`已跳过 ${u.latest}，有更高版本时会再提示`); }
    if (k === 'later') toast('可以随时在"设置 › 更新"中继续');
    if (k === 'download') startDownload();
    if (k === 'restart') restartToUpdate();
  });
  ov.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  ov.querySelector('.btn.primary').focus();
}
let dlTimer = null;
function startDownload() {
  const u = state.update;
  clearInterval(dlTimer);
  u.phase = 'downloading'; u.progress = 0; render();
  dlTimer = setInterval(() => {
    u.progress = Math.min(100, u.progress + 7 + Math.floor(Math.random() * 6));
    if (u.progress >= 100) { clearInterval(dlTimer); u.phase = 'ready'; render(); toast(`${u.latest} 已下载完成，重启后生效`); return; }
    if (state.view === 'settings') render();
  }, 300);
}
function checkUpdate() {
  const u = state.update;
  u.phase = 'checking'; render();
  setTimeout(() => {
    u.lastCheck = '刚刚';
    u.phase = 'available';
    if (state.settings.autoCheck && state.settings.autoDownload) { startDownload(); return; }
    render();
  }, 1200);
}
function restartToUpdate() {
  const u = state.update;
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="dialog installing" role="alertdialog" aria-label="正在更新">${logo(40)}<h2>正在安装 XTodoY ${u.latest}…</h2><p>已完成更新前备份，安装完成后会自动重新打开。</p><div class="progress indeterminate"><i></i></div></div>`;
  document.body.append(ov);
  setTimeout(() => {
    ov.remove();
    Object.assign(u, { phase: 'latest', current: u.latest, progress: 0, lastCheck: '刚刚', justUpdated: true, skipped: false });
    state.view = 'today'; state.selected = null; render();
  }, 2200);
}
// 原型演示：直接切换到某个更新状态
function setUpdateDemo(v) {
  const u = state.update;
  clearInterval(dlTimer);
  Object.assign(u, { current: '1.0.0', latest: '1.1.0', justUpdated: false, skipped: false, error: '', progress: 0 });
  const reveal = () => $('.update-status')?.scrollIntoView({ block: 'center' });
  if (v === 'downloading') { state.view = 'settings'; startDownload(); reveal(); return; }
  if (v === 'updated') { Object.assign(u, { phase: 'latest', current: '1.1.0', justUpdated: true }); state.view = 'today'; render(); return; }
  u.phase = v;
  if (v === 'ready') u.progress = 100;
  if (v === 'error') u.error = '无法连接更新服务器（github.com），请检查网络后重试';
  state.view = 'settings';
  render();
  reveal();
}

/* 侧边栏折叠（侧边栏底部按钮 / Ctrl+B） */
function toggleSidebar() {
  state.sidebarCollapsed = !state.sidebarCollapsed;
  render();
}

/* ---------- 主渲染 ---------- */
let lastRenderedView = null;
function render() {
  const focusId = document.activeElement?.id;
  const v = state.view;
  const keepScroll = lastRenderedView === v ? $('.main-scroll')?.scrollTop || 0 : 0;
  const main = v === 'stats' ? renderStats() : v === 'tags' ? renderTagManager() : v === 'settings' ? renderSettings() : renderList();
  $('#app').innerHTML = `
    <div class="body ${state.sidebarCollapsed ? 'sidebar-collapsed' : ''}">
      ${renderSidebar()}${main}${renderDetail()}
    </div>`;
  document.title = `XTodoY · ${state.search ? '搜索' : VIEW_META[v]?.title || ({ stats: '统计', tags: '标签管理', settings: '设置' }[v] || tagById(v.slice(4))?.name)}`;
  if (focusId && document.getElementById(focusId)) document.getElementById(focusId).focus();
  if (keepScroll && $('.main-scroll')) $('.main-scroll').scrollTop = keepScroll;
  lastRenderedView = v;
}

/* ---------- Toast ---------- */
function toast(msg, undo) {
  const host = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast'; el.setAttribute('role', 'status');
  el.innerHTML = `<span class="msg">${esc(msg)}</span>${undo ? '<button>撤销</button>' : ''}<button aria-label="关闭提示">${icon('x', 14)}</button>`;
  host.replaceChildren(el);
  const timer = setTimeout(() => el.remove(), 5000);
  const btns = el.querySelectorAll('button');
  if (undo) btns[0].onclick = () => { clearTimeout(timer); el.remove(); undo(); render(); };
  btns[btns.length - 1].onclick = () => { clearTimeout(timer); el.remove(); };
}

/* ---------- 操作 ---------- */
function toggleTodo(id) {
  const t = state.todos.find((x) => x.id === id);
  const snapshot = structuredClone(t);
  const now = `${TODAY} ${new Date().toTimeString().slice(0, 5)}`;
  if (!t.done && t.repeat) {
    // FR-REC-05：写完成记录，日期前进到下一实例（跳过已过去的实例）
    state.logs.push({ title: t.title, tag: t.tags[0] || null, at: now });
    let next = nextOccurrences(addDays(t.date, 1), t.repeat, 1)[0];
    while (next && next < TODAY) next = nextOccurrences(addDays(next, 1), t.repeat, 1)[0];
    if (!next) { t.done = true; t.doneAt = now; } else t.date = next;
    render();
    toast(`已完成本次，下一次：${next ? friendlyDate(next) : '无'}`, () => { Object.assign(t, snapshot); state.logs.pop(); });
    return;
  }
  const row = document.querySelector(`.todo[data-id="${id}"]`);
  t.done = !t.done; t.doneAt = t.done ? now : null;
  if (t.done && row) {
    const btn = row.querySelector('.check'); btn.setAttribute('aria-checked', 'true'); row.classList.add('is-done');
    setTimeout(() => { row.classList.add('leaving'); setTimeout(render, 300); }, 700);
  } else render();
  toast(t.done ? `已完成"${t.title}"` : `已恢复为未完成`, () => Object.assign(t, snapshot));
}
function deleteTodo(id) {
  const t = state.todos.find((x) => x.id === id);
  t.deleted = true; t.deletedAt = TODAY;
  if (state.selected === id) state.selected = null;
  render();
  toast(`已删除"${t.title}"`, () => { t.deleted = false; });
}
function quickAdd(title) {
  const tagView = state.view.startsWith('tag:') ? state.view.slice(4) : null;
  const t = { id: 'n' + Date.now(), title, note: '', date: state.view === 'today' ? TODAY : null, time: null, priority: 'none', tags: tagView ? [tagView] : [], reminders: [], repeat: null, done: false, doneAt: null, deleted: false };
  state.todos.unshift(t);
  render();
  $('#quick-add')?.focus();
}
function setTheme(v) {
  state.settings.theme = v; localStorage.setItem('xtodoy-theme', v);
  applyTheme(); render();
}
function applyTheme() {
  const v = state.settings.theme;
  const dark = v === 'dark' || (v === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  document.querySelectorAll('[data-theme-btn]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.themeBtn === v));
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

/* 对话框 */
function dialog(html, onConfirm) {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="dialog" role="alertdialog" aria-modal="true">${html}</div>`;
  document.body.append(ov);
  const close = () => ov.remove();
  ov.addEventListener('click', (e) => {
    if (e.target === ov || e.target.closest('[data-dlg="cancel"]')) close();
    if (e.target.closest('[data-dlg="ok"]')) { onConfirm(ov); close(); render(); }
  });
  ov.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  ov.querySelector('[data-dlg="cancel"]').focus();
}
function deleteTagDialog(id) {
  const tg = tagById(id);
  const sub = descendants(id);
  const n = liveTodos().filter((t) => t.tags.some((x) => [id, ...sub].includes(x))).length;
  dialog(`
    <h2>${icon('alert', 18)}删除标签"${esc(tg.name)}"？</h2>
    <p>包含 ${sub.length} 个子标签，关联 ${n} 项待办。待办本身<b>不会被删除</b>，只会移除标签关联。</p>
    ${sub.length ? `<div class="options" role="radiogroup" aria-label="子标签处理">
      <label class="option"><input type="radio" name="sub" value="up" checked><div><b>子标签上移一级</b><span>"${esc(children(id).map((c) => c.name).join('、'))}"将移到${tg.parent ? `"${esc(tagById(tg.parent).name)}"下` : '根级'}</span></div></label>
      <label class="option"><input type="radio" name="sub" value="all"><div><b>一并删除子标签</b><span>共删除 ${sub.length + 1} 个标签</span></div></label>
    </div>` : ''}
    <div class="actions"><button class="btn" data-dlg="cancel">取消</button><button class="btn danger" data-dlg="ok">删除</button></div>`,
  (ov) => {
    const mode = ov.querySelector('input[name="sub"]:checked')?.value || 'up';
    const removed = mode === 'all' ? [id, ...sub] : [id];
    if (mode === 'up') children(id).forEach((c) => (c.parent = tg.parent));
    state.tags = state.tags.filter((t) => !removed.includes(t.id));
    state.todos.forEach((t) => (t.tags = t.tags.filter((x) => !removed.includes(x))));
    if (removed.includes(state.view.slice(4))) state.view = 'tags';
    toast(`已删除标签"${tg.name}"`);
  });
}
function mergeTagDialog(id) {
  const tg = tagById(id);
  const forbidden = [id, ...descendants(id)];
  dialog(`
    <h2>${icon('merge', 18)}合并"${esc(tg.name)}"</h2>
    <p>"${esc(tg.name)}"下的待办将改挂到目标标签（已挂的不重复），子标签移到目标下，然后删除"${esc(tg.name)}"。</p>
    <label class="field-label" for="merge-to">合并到</label>
    <select id="merge-to" class="select" style="margin-bottom:20px">${state.tags.filter((t) => !forbidden.includes(t.id)).map((t) => `<option value="${t.id}">${esc(tagPath(t.id))}</option>`).join('')}</select>
    <div class="actions"><button class="btn" data-dlg="cancel">取消</button><button class="btn primary" data-dlg="ok">合并</button></div>`,
  (ov) => {
    const to = ov.querySelector('#merge-to').value;
    state.todos.forEach((t) => { if (t.tags.includes(id)) t.tags = [...new Set(t.tags.map((x) => (x === id ? to : x)))]; });
    children(id).forEach((c) => (c.parent = to));
    state.tags = state.tags.filter((t) => t.id !== id);
    toast(`已将"${tg.name}"合并到"${tagById(to).name}"`);
  });
}
function addTag(parent) {
  if (parent && depthOf(parent) >= 4) { toast('标签最多 5 级'); return; }
  const id = 'nt' + Date.now();
  state.tags.push({ id, parent, name: parent ? '新子标签' : '新标签', color: parent ? tagById(parent).color : 'slate' });
  state.renaming = id; state.view = 'tags'; render();
  const inp = document.querySelector(`[data-rename="${id}"]`); inp?.focus(); inp?.select();
}

/* ---------- 事件 ---------- */
document.addEventListener('click', (e) => {
  // 自定义下拉列表挂在 body 上，点击选项不应关闭它所在的弹层
  if (e.target.closest('.select-content, .select-trigger')) return;
  const popEl = e.target.closest('.popover');
  if (popEl) return onPopoverClick(e);
  if (pop && !e.target.closest('[data-action^="pop-"]')) closePopover();

  const a = e.target.closest('[data-action]');
  if (!a) return;
  const { action, id, val } = a.dataset;
  switch (action) {
    case 'view': state.view = a.dataset.view; state.search = ''; $('#search').value = ''; state.selected = null; render(); break;
    case 'toggle-tag': e.stopPropagation(); state.collapsedTags.has(id) ? state.collapsedTags.delete(id) : state.collapsedTags.add(id); render(); break;
    case 'toggle-group': state.collapsedGroups.has(id) ? state.collapsedGroups.delete(id) : state.collapsedGroups.add(id); render(); break;
    case 'toggle': e.stopPropagation(); toggleTodo(id); break;
    case 'select': state.selected = a.dataset.id; render(); break;
    case 'close-detail': state.selected = null; render(); break;
    case 'delete': e.stopPropagation(); deleteTodo(id); break;
    case 'restore': e.stopPropagation(); { const t = state.todos.find((x) => x.id === id); t.deleted = false; render(); toast(`已恢复"${t.title}"`); } break;
    case 'purge': e.stopPropagation(); dialog(`<h2>${icon('alert', 18)}永久删除？</h2><p>此操作无法撤销，事项及其完成记录将被永久删除。</p><div class="actions"><button class="btn" data-dlg="cancel">取消</button><button class="btn danger" data-dlg="ok">永久删除</button></div>`, () => { state.todos = state.todos.filter((t) => t.id !== id); }); break;
    case 'purge-all': dialog(`<h2>${icon('alert', 18)}清空回收站？</h2><p>回收站中的全部事项将被永久删除，无法撤销。</p><div class="actions"><button class="btn" data-dlg="cancel">取消</button><button class="btn danger" data-dlg="ok">清空</button></div>`, () => { state.todos = state.todos.filter((t) => !t.deleted); }); break;
    case 'priority': current().priority = val; render(); break;
    case 'skip': { const t = current(); const snap = t.date; t.date = nextOccurrences(addDays(t.date, 1), t.repeat, 1)[0]; render(); toast(`已跳过本次，下一次：${friendlyDate(t.date)}`, () => (t.date = snap)); } break;
    case 'include-children': state.includeChildren = val === '1'; render(); break;
    case 'toggle-sidebar': toggleSidebar(); break;
    case 'pop-date': state.calMonth = null; datePopover(a); break;
    case 'pop-repeat': repeatPopover(a); break;
    case 'pop-reminder': reminderPopover(a); break;
    case 'pop-tags': tagsPopover(a); break;
    case 'stats-tab': state.statsTab = val; state.statsOffset = 0; render(); break;
    case 'stats-nav': state.statsOffset = val === '0' ? 0 : Math.min(0, state.statsOffset + Number(val)); render(); break;
    case 'set-toggle': state.settings[a.dataset.key] = !state.settings[a.dataset.key]; render(); break;
    case 'theme': setTheme(val); break;
    case 'toast': toast(a.dataset.msg); break;
    case 'upd-check': checkUpdate(); break;
    case 'upd-details': updateDialog(); break;
    case 'upd-download': startDownload(); break;
    case 'upd-cancel': clearInterval(dlTimer); state.update.phase = 'available'; state.update.progress = 0; render(); toast('已取消下载，未完成的文件已删除'); break;
    case 'upd-restart': restartToUpdate(); break;
    case 'upd-dismiss-banner': state.update.justUpdated = false; render(); break;
    case 'import': dialog(`<h2>${icon('alert', 18)}导入备份将覆盖当前数据</h2><p>导入前会自动备份当前数据库，可在"打开数据目录"中找回。</p><div class="actions"><button class="btn" data-dlg="cancel">取消</button><button class="btn danger" data-dlg="ok">选择文件并导入</button></div>`, () => toast('（原型）已导入备份')); break;
    case 'tag-add-root': addTag(null); break;
    case 'tag-add-child': addTag(id); break;
    case 'tag-rename': state.renaming = id; render(); { const inp = document.querySelector(`[data-rename="${id}"]`); inp.focus(); inp.select(); } break;
    case 'tag-delete': deleteTagDialog(id); break;
    case 'tag-merge': mergeTagDialog(id); break;
    case 'tag-color': {
      const tg = tagById(id);
      const el = openPopover(a, `<h3>标签颜色</h3><div class="swatches">${TAG_COLORS.map((c) => `<button class="swatch tc-${c}" aria-pressed="${tg.color === c}" aria-label="${c}" data-color="${c}">${icon('check', 14)}</button>`).join('')}</div>`, 'color');
      el.dataset.tag = id;
      break;
    }
    case 'win-close': toast(state.settings.closeAction === 'tray' ? 'XTodoY 仍在后台运行，可从托盘或悬浮窗打开（首次关闭时提示）' : '（原型）程序将退出'); break;
    case 'win-min': toast('（原型）窗口已最小化'); break;
  }
});

function onPopoverClick(e) {
  const b = e.target.closest('[data-pop], [data-color]');
  if (!b) return;
  const t = current();
  if (b.dataset.color) { tagById(pop.el.dataset.tag).color = b.dataset.color; closePopover(); render(); return; }
  const k = b.dataset.pop, v = b.dataset.val;
  if (k === 'date') {
    t.date = v || null;
    if (!t.date) { if (t.reminders.length) toast('已清除日期，相对提醒已一并移除'); t.reminders = []; t.repeat = null; }
    closePopover(); render(); return;
  }
  if (k === 'month') { const [y, m] = (state.calMonth || (t.date || TODAY).slice(0, 7)).split('-').map(Number); state.calMonth = ymd(new Date(y, m - 1 + Number(v), 1)).slice(0, 7); render(); datePopover(document.querySelector('[data-action="pop-date"]')); return; }
  if (k === 'wd') { const d = Number(v); const days = new Set(t.repeat.days); days.has(d) ? days.size > 1 && days.delete(d) : days.add(d); t.repeat.days = [...days]; render(); reopenPopover(); return; }
  if (k === 'newtag') { const id = 'nt' + Date.now(); state.tags.push({ id, parent: null, name: v, color: 'slate' }); t.tags.push(id); render(); reopenPopover(); return; }
  if (k === 'need-date') { closePopover(); datePopover(document.querySelector('[data-action="pop-date"]')); }
}

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.set) { const k = el.dataset.set; state.settings[k] = /^-?\d+$/.test(el.value) ? Number(el.value) : el.value; render(); return; }
  if (!pop || !el.closest('.popover')) return;
  const t = current(); const k = el.dataset.pop;
  if (k === 'allday') { t.time = el.checked ? null : '09:00'; }
  if (k === 'time') { t.time = el.value; }
  if (k === 'rtype') {
    if (el.value === 'none') t.repeat = null;
    else { if (!t.date) t.date = TODAY; t.repeat = { type: el.value, interval: 1, days: [parse(t.date).getDay()], monthDay: Number(t.date.slice(8)), end: { type: 'never' } }; }
  }
  if (k === 'interval') t.repeat.interval = Math.max(1, Number(el.value) || 1);
  if (k === 'mday') t.repeat.monthDay = el.value === 'last' ? 'last' : Number(el.value);
  if (k === 'end') t.repeat.end = el.value === 'date' ? { type: 'date', date: '2026-12-31' } : el.value === 'count' ? { type: 'count', count: 10 } : { type: 'never' };
  if (k === 'rem') {
    const min = Number(el.value);
    if (el.checked && t.reminders.length >= 5) { el.checked = false; toast('最多 5 个提醒'); return; }
    t.reminders = el.checked ? [...t.reminders, { min }] : t.reminders.filter((r) => r.min !== min);
  }
  if (k === 'tag') t.tags = el.checked ? [...t.tags, el.value] : t.tags.filter((x) => x !== el.value);
  render(); reopenPopover();
});

document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.id === 'search') { state.search = el.value.trim(); state.selected = null; render(); return; }
  if (el.dataset.pop === 'tagq') { tagsPopover(pop.anchor, el.value); return; }
  if (el.dataset.field) { current()[el.dataset.field] = el.value; const row = document.querySelector(`.todo[data-id="${state.selected}"] .text`); if (row && el.dataset.field === 'title') row.textContent = el.value; }
});

document.addEventListener('keydown', (e) => {
  const el = e.target;
  if (el.id === 'quick-add' && e.key === 'Enter') { const v = el.value.trim(); if (v) quickAdd(v); return; }
  if (el.dataset.rename) {
    if (e.key === 'Enter' || e.key === 'Escape') {
      const tg = tagById(el.dataset.rename); const v = el.value.trim();
      const dup = state.tags.some((t) => t.id !== tg.id && t.parent === tg.parent && t.name.toLowerCase() === v.toLowerCase());
      if (e.key === 'Enter' && dup) { toast(`同级下已存在"${v}"`); return; }
      if (e.key === 'Enter' && v) tg.name = v;
      state.renaming = null; render();
    }
    return;
  }
  if (e.ctrlKey && e.key.toLowerCase() === 'n') { e.preventDefault(); if (!$('#quick-add')) { state.view = 'today'; render(); } $('#quick-add').focus(); return; }
  if (e.ctrlKey && e.key.toLowerCase() === 'f') { e.preventDefault(); $('#search').focus(); return; }
  if (e.ctrlKey && e.key.toLowerCase() === 'b') { e.preventDefault(); toggleSidebar(); return; }
  if (e.ctrlKey && e.key === ',') { e.preventDefault(); state.view = 'settings'; render(); return; }
  if (e.ctrlKey && /^[1-5]$/.test(e.key)) { e.preventDefault(); state.view = ['today', 'plan', 'all', 'done', 'trash'][Number(e.key) - 1]; state.search = ''; render(); return; }
  if (e.key === 'Escape') { if (pop) closePopover(); else if (state.selected) { state.selected = null; render(); } return; }
  const row = el.closest?.('.todo');
  if (row && el === row) {
    if (e.key === ' ' && state.view !== 'trash') { e.preventDefault(); toggleTodo(row.dataset.id); }
    if (e.key === 'Enter') { state.selected = row.dataset.id; render(); }
    if (e.key === 'Delete') deleteTodo(row.dataset.id);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const rows = [...document.querySelectorAll('.todo')]; rows[rows.indexOf(row) + (e.key === 'ArrowDown' ? 1 : -1)]?.focus(); }
  }
  if (el.matches?.('.nav-item[role="button"]') && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); el.click(); }
});

/* 标签拖拽：拖到另一行成为其子标签；不能拖入自身子孙或超过 5 级 */
let dragId = null;
const canDrop = (target) => {
  if (!dragId || target === dragId) return false;
  if (target === null) return true;
  if (descendants(dragId).includes(target)) return false;
  return depthOf(target) + 1 + subtreeHeight(dragId) <= 4;
};
document.addEventListener('dragstart', (e) => { const r = e.target.closest?.('.tag-row[data-id]'); if (!r) return; dragId = r.dataset.id; r.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
document.addEventListener('dragend', () => { dragId = null; document.querySelectorAll('.dragging, .drop-target, .drop-invalid').forEach((x) => x.classList.remove('dragging', 'drop-target', 'drop-invalid')); });
document.addEventListener('dragover', (e) => {
  const r = e.target.closest?.('.tag-row'); if (!r || !dragId) return;
  const target = r.hasAttribute('data-drop-root') ? null : r.dataset.id;
  document.querySelectorAll('.drop-target, .drop-invalid').forEach((x) => x !== r && x.classList.remove('drop-target', 'drop-invalid'));
  if (canDrop(target)) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; r.classList.add('drop-target'); } else { e.dataTransfer.dropEffect = 'none'; r.classList.add('drop-invalid'); }
});
document.addEventListener('drop', (e) => {
  const r = e.target.closest?.('.tag-row'); if (!r || !dragId) return;
  const target = r.hasAttribute('data-drop-root') ? null : r.dataset.id;
  if (!canDrop(target)) return;
  e.preventDefault();
  const tg = tagById(dragId); tg.parent = target;
  toast(`"${tg.name}"已移到${target ? `"${tagById(target).name}"下` : '根级'}`);
  render();
});

/* ---------- 初始化 ---------- */
function mountChrome() {
  document.body.insertAdjacentHTML('afterbegin', `
    <div class="proto-bar" role="note" aria-label="原型工具条">
      <strong>XTodoY 交互原型</strong><span>示例日期固定为 2026-11-02（周一）· 数据不保存</span>
      <span class="spacer"></span>
      <a href="system.html">系统组件页（悬浮窗 / 托盘 / 通知）→</a>
      <label for="upd-demo">更新演示</label>
      <select id="upd-demo" class="proto-select" onchange="setUpdateDemo(this.value)">
        <option value="latest">已是最新</option><option value="checking">检查中</option><option value="available">发现新版本</option>
        <option value="downloading">下载中</option><option value="ready">待重启</option><option value="error">检查失败</option><option value="updated">更新完成后</option>
      </select>
      <span>主题</span>
      <span class="seg" role="group" aria-label="原型主题">
        <button data-theme-btn="light" onclick="setTheme('light')">${icon('sun', 12)}浅色</button>
        <button data-theme-btn="dark" onclick="setTheme('dark')">${icon('moon', 12)}深色</button>
        <button data-theme-btn="system" onclick="setTheme('system')">${icon('laptop', 12)}系统</button>
      </span>
    </div>
    <div class="window">
      <header class="titlebar">
        <div class="brand">${logo()}<span>XTodoY</span></div>
        <label class="search">${icon('search', 14)}<span class="sr-only">搜索</span><input id="search" placeholder="搜索待办" autocomplete="off"><kbd>Ctrl+F</kbd></label>
        <div class="win-controls">
          <button data-action="win-min" aria-label="最小化">${icon('minus', 14)}</button>
          <button aria-label="最大化">${icon('square', 12)}</button>
          <button class="close" data-action="win-close" aria-label="关闭">${icon('x', 14)}</button>
        </div>
      </header>
      <div id="app"></div>
    </div>
    <div id="toasts" class="toast-host" aria-live="polite"></div>`);
}
mountChrome();
applyTheme();
render();

/* ---------- 下拉选择（设计系统 §7.9）：把原生 <select class="select"> 渐进替换为与主题一致的下拉列表 ---------- */
let openSelect = null;
function closeCustomSelect(focusTrigger = false) {
  if (!openSelect) return;
  openSelect.menu.remove();
  openSelect.trigger.setAttribute('aria-expanded', 'false');
  openSelect.trigger.dataset.state = 'closed';
  if (focusTrigger) openSelect.trigger.focus();
  openSelect = null;
}
function enhanceSelects(root = document) {
  root.querySelectorAll('select.select:not([data-enhanced])').forEach((sel) => {
    sel.dataset.enhanced = '1';
    sel.hidden = true;
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'select-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-label', sel.getAttribute('aria-label') || '');
    if (sel.style.width) trigger.style.width = sel.style.width;
    if (sel.style.marginBottom) trigger.style.marginBottom = sel.style.marginBottom;
    const paint = () => (trigger.innerHTML = `<span>${esc(sel.selectedOptions[0]?.textContent ?? '')}</span><span class="select-chevron">${icon('chevronDown', 14)}</span>`);
    paint();
    sel.after(trigger);
    const open = () => {
      closeCustomSelect();
      const menu = document.createElement('div');
      menu.className = 'select-content';
      menu.setAttribute('role', 'listbox');
      menu.innerHTML = [...sel.options].map((o, i) => `<div class="select-item" role="option" id="opt-${i}" data-i="${i}" aria-selected="${o.selected}" data-state="${o.selected ? 'checked' : ''}">${o.selected ? `<span class="select-check">${icon('check', 14)}</span>` : ''}${esc(o.textContent)}</div>`).join('');
      document.body.append(menu);
      const r = trigger.getBoundingClientRect();
      menu.style.minWidth = r.width + 'px';
      const below = innerHeight - r.bottom - 8;
      menu.style.left = Math.min(r.left, innerWidth - menu.offsetWidth - 8) + 'px';
      menu.style.top = (below >= Math.min(menu.offsetHeight, 200) ? r.bottom + 4 : Math.max(8, r.top - menu.offsetHeight - 4)) + 'px';
      let hi = sel.selectedIndex;
      const highlight = (i) => {
        hi = (i + sel.options.length) % sel.options.length;
        menu.querySelectorAll('.select-item').forEach((el, k) => el.toggleAttribute('data-highlighted', k === hi));
        menu.querySelector(`[data-i="${hi}"]`)?.scrollIntoView({ block: 'nearest' });
        trigger.setAttribute('aria-activedescendant', `opt-${hi}`);
      };
      const choose = (i) => {
        sel.selectedIndex = i;
        paint();
        closeCustomSelect(true);
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      };
      menu.addEventListener('mousemove', (e) => { const it = e.target.closest('.select-item'); if (it) highlight(Number(it.dataset.i)); });
      menu.addEventListener('click', (e) => { const it = e.target.closest('.select-item'); if (it) choose(Number(it.dataset.i)); });
      openSelect = { menu, trigger, highlight, choose, get hi() { return hi; } };
      trigger.setAttribute('aria-expanded', 'true');
      trigger.dataset.state = 'open';
      highlight(hi);
    };
    trigger.addEventListener('click', (e) => { e.stopPropagation(); openSelect?.trigger === trigger ? closeCustomSelect() : open(); });
    trigger.addEventListener('keydown', (e) => {
      if (!openSelect || openSelect.trigger !== trigger) {
        if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); open(); }
        return;
      }
      if (e.key === 'ArrowDown') { e.preventDefault(); openSelect.highlight(openSelect.hi + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); openSelect.highlight(openSelect.hi - 1); }
      else if (e.key === 'Home') { e.preventDefault(); openSelect.highlight(0); }
      else if (e.key === 'End') { e.preventDefault(); openSelect.highlight(sel.options.length - 1); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSelect.choose(openSelect.hi); }
      else if (e.key === 'Escape' || e.key === 'Tab') { e.stopPropagation(); closeCustomSelect(e.key === 'Escape'); }
    });
  });
}
document.addEventListener('mousedown', (e) => { if (openSelect && !e.target.closest('.select-content, .select-trigger')) closeCustomSelect(); }, true);
new MutationObserver(() => enhanceSelects()).observe(document.body, { childList: true, subtree: true });
enhanceSelects();
