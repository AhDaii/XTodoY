import { useRef, useState, type KeyboardEvent } from 'react';
import type { Settings, SortMode, SortScope, TagNode, Todo, TodoGroup, ViewCounts } from '@shared/types';
import { EmptyState } from '../components/Overlay';
import { Icon, type IconName } from '../components/Icon';
import { Select } from '../components/Select';
import { TodoRow } from '../components/TodoRow';
import { UpdatedBanner } from '../components/Update';
import { useTodoActions } from '../lib/actions';
import { api, call } from '../lib/api';
import { useGroups, useNotificationStatus, useReportError } from '../lib/data';
import { friendlyDate, parse, today, weekday } from '../lib/dates';
import { dropNeighbors, stepNeighbors } from '@shared/reorder';
import { useUi } from '../lib/store';

const VIEW_META = {
  today: {
    title: '今天',
    sub: () => `${parse(today()).getMonth() + 1}月${parse(today()).getDate()}日 ${weekday(today())}`,
  },
  plan: { title: '计划', sub: () => '所有有截止日期的未完成事项' },
  all: { title: '全部', sub: () => '所有未完成事项' },
  done: { title: '已完成', sub: () => '按完成日期倒序' },
  trash: { title: '回收站', sub: () => '删除的事项保留 30 天' },
} as const;

const EMPTY: Record<string, [IconName, string, string]> = {
  today: ['sun', '今天没有到期的事项', '在上方输入框添加，或去"计划"看看接下来的安排。'],
  plan: ['calendar', '没有计划中的事项', '为待办设置截止日期后会出现在这里。'],
  all: ['inbox', '还没有待办', '在上方输入框写下第一件事。'],
  done: ['checkCircle', '还没有完成记录', '勾选待办前的圆圈即可标记完成。'],
  trash: ['trash', '回收站是空的', '删除的事项会在这里保留 30 天。'],
  tag: ['tag', '这个标签下没有未完成事项', '新建的待办会自动挂上当前标签。'],
  search: ['search', '没有匹配的事项', '换个关键词试试。'],
};

const SORT_OPTIONS: { value: SortMode; label: string; hint?: string }[] = [
  { value: 'due', label: '按截止时间', hint: '日期 → 时间 → 优先级' },
  { value: 'manual', label: '手动排序', hint: '拖动或 Alt+↑↓ 调整顺序' },
  { value: 'priority', label: '按优先级' },
  { value: 'created', label: '按创建时间', hint: '最新的在前' },
  { value: 'title', label: '按标题' },
];

export function ListPage({
  tags,
  counts,
  settings,
  updatedTo,
}: {
  tags: TagNode[];
  counts: ViewCounts;
  settings: Settings | null;
  /** 更新后首次启动：显示"已更新到"横幅（FR-UPD-11） */
  updatedTo: string | null;
}) {
  const { route, search, includeChildren, showDoneInTag, selectedId, collapsedGroups } = useUi();
  const ui = useUi.getState;
  const groups = useGroups(route, search, includeChildren, showDoneInTag);
  const notify = useNotificationStatus();
  const actions = useTodoActions();
  const report = useReportError();
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const tag = route.kind === 'tag' ? tags.find((t) => t.id === route.tagId) : undefined;
  const view = route.kind === 'view' ? route.view : null;
  const canAdd = !search && (route.kind === 'tag' || (view !== 'done' && view !== 'trash'));
  // 在"今天"和"计划"里新建的待办默认今天到期，避免新建后在当前视图看不到
  const datedView = view === 'today' || view === 'plan';
  const addHint = datedView ? '截止日期：今天' : tag ? `标签：${tag.name}` : '';

  const add = async () => {
    const title = draft.trim();
    if (!title) return;
    try {
      await call(api.todos.create({ title, dueDate: datedView ? today() : null, tagIds: tag ? [tag.id] : [] }));
      setDraft('');
    } catch (e) {
      report(e);
    }
  };

  // 排序（FR-TODO-06）：每个视图独立记忆；手动模式下可拖拽
  const scope: SortScope | null = search
    ? null
    : route.kind === 'tag'
      ? 'tag'
      : view === 'today' || view === 'plan' || view === 'all'
        ? view
        : null;
  const sort = scope && settings ? settings.listSort[scope] : 'due';
  const manual = sort === 'manual';
  const setSort = (mode: SortMode) =>
    scope && settings && void call(api.settings.set('listSort', { ...settings.listSort, [scope]: mode })).catch(report);
  const [drag, setDrag] = useState<{ id: string; group: string } | null>(null);
  const [over, setOver] = useState<{ id: string; after: boolean } | null>(null);
  const reorder = (n: { afterId: string | null; beforeId: string | null } | null, id: string) =>
    n && void call(api.todos.reorder(id, n.afterId, n.beforeId)).catch(report);

  const flat = (groups ?? []).flatMap((g) => (collapsedGroups.has(g.id) ? [] : g.items));
  const groupOf = (id: string) => (groups ?? []).find((g) => g.items.some((t) => t.id === id));
  const onRowKey = (t: Todo) => (e: KeyboardEvent<HTMLLIElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === ' ' && view !== 'trash') {
      e.preventDefault();
      void actions.toggle(t);
    } else if (e.key === 'Enter') ui().select(t.id);
    else if (e.key === 'Delete' && view !== 'trash') void actions.remove(t);
    else if (manual && e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      const g = groupOf(t.id);
      if (g) reorder(stepNeighbors(g.items, t.id, e.key === 'ArrowDown' ? 1 : -1), t.id);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const i = flat.findIndex((x) => x.id === t.id) + (e.key === 'ArrowDown' ? 1 : -1);
      const next = flat[i];
      if (next) document.querySelector<HTMLElement>(`.todo[data-id="${next.id}"]`)?.focus();
    }
  };

  const title = search ? '搜索结果' : tag ? tag.name : view ? VIEW_META[view].title : '';
  const sub = search ? '在标题与备注中匹配（不含回收站）' : tag ? tag.displayPath : view ? VIEW_META[view].sub() : '';
  const total = (groups ?? []).reduce((n, g) => n + g.items.length, 0);
  const todayAllDone =
    view === 'today' && !search && groups && groups[0]!.items.length === 0 && groups[1]!.items.length > 0;
  const emptyKey = search ? 'search' : tag ? 'tag' : (view ?? 'today');
  const [ic, h, p] = EMPTY[emptyKey]!;

  return (
    <main className="main" aria-label={title}>
      <header className="main-header">
        <div>
          <h1>
            {tag ? (
              <span className={`chip tc-${tag.color}`} style={{ height: 24, fontSize: 'var(--text-sm)' }}>
                <span className="dot" />
                <span>{tag.name}</span>
              </span>
            ) : (
              title
            )}
          </h1>
          <div className="sub">{sub}</div>
        </div>
        <span className="spacer" />
        {tag && !search && (
          <div className="seg" role="group" aria-label="范围">
            <button aria-pressed={includeChildren} onClick={() => ui().setIncludeChildren(true)}>
              包含子标签
            </button>
            <button aria-pressed={!includeChildren} onClick={() => ui().setIncludeChildren(false)}>
              仅本标签
            </button>
          </div>
        )}
        {tag && !search && (
          <button
            className={`btn sm ${showDoneInTag ? '' : 'ghost'}`}
            aria-pressed={showDoneInTag}
            onClick={() => ui().setShowDoneInTag(!showDoneInTag)}
          >
            <Icon name="checkCircle" size={14} />
            显示已完成
          </button>
        )}
        {scope && <Select<SortMode> ariaLabel="排序方式" value={sort} options={SORT_OPTIONS} onChange={setSort} />}
        {view === 'trash' && total > 0 && (
          <button className="btn sm ghost" onClick={() => void call(api.todos.purgeAll()).catch(report)}>
            清空回收站
          </button>
        )}
      </header>

      {updatedTo && !search && <UpdatedBanner version={updatedTo} />}

      {notify === 'denied' && !search && (
        <div className="banner warn" role="status">
          <Icon name="bell" />
          <span>系统已关闭 XTodoY 的通知，到点的提醒无法弹出。</span>
          <span style={{ flex: 1 }} />
          <button className="btn sm ghost" onClick={() => void call(api.openNotificationSettings()).catch(report)}>
            打开系统设置
          </button>
        </div>
      )}

      {view === 'today' && !search && counts.overdue > 0 && (
        <div className="banner warn" role="status">
          <Icon name="alert" />
          <span>有 {counts.overdue} 项逾期未完成，不计入今日待办，可在"计划 › 逾期"中查看。</span>
          <span style={{ flex: 1 }} />
          <button className="btn sm ghost" onClick={() => ui().go({ kind: 'view', view: 'plan' })}>
            查看
          </button>
        </div>
      )}

      {canAdd && (
        <label className="quick-add">
          <Icon name="plus" />
          <span className="sr-only">快速新建待办</span>
          <input
            id="quick-add"
            ref={inputRef}
            value={draft}
            maxLength={200}
            autoComplete="off"
            placeholder="添加待办，回车保存"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void add()}
          />
          {addHint && <span className="hint">{addHint}</span>}
          <kbd className="hint">Ctrl+N</kbd>
        </label>
      )}

      <div className="main-scroll">
        {groups === null ? null : todayAllDone ? (
          <>
            <EmptyState
              icon="check"
              tone="success"
              title="今天的事都做完了"
              text={`已完成 ${groups[1]!.items.length} 项，好好休息一下。`}
            />
            {renderGroups(groups.slice(1))}
          </>
        ) : total === 0 ? (
          <EmptyState icon={ic} title={h} text={p} />
        ) : (
          renderGroups(groups)
        )}
      </div>
    </main>
  );

  /** 手动排序：只能在同一分组内拖动（跨分组的位置由日期等字段决定） */
  function dragFor(g: TodoGroup, t: Todo) {
    const same = drag?.group === g.id;
    const className = [
      drag?.id === t.id ? 'dragging' : '',
      same && over?.id === t.id && drag?.id !== t.id ? (over.after ? 'drop-after' : 'drop-before') : '',
    ].join(' ');
    return {
      className,
      props: {
        onDragStart: (e: React.DragEvent<HTMLLIElement>) => {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', t.title);
          setDrag({ id: t.id, group: g.id });
        },
        onDragEnd: () => {
          setDrag(null);
          setOver(null);
        },
        onDragOver: (e: React.DragEvent<HTMLLIElement>) => {
          if (!same) return; // 不调用 preventDefault：显示禁止光标
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          const r = e.currentTarget.getBoundingClientRect();
          const after = e.clientY > r.top + r.height / 2;
          if (over?.id !== t.id || over.after !== after) setOver({ id: t.id, after });
        },
        onDrop: (e: React.DragEvent<HTMLLIElement>) => {
          e.preventDefault();
          if (drag && same && over) reorder(dropNeighbors(g.items, drag.id, t.id, over.after), drag.id);
          setDrag(null);
          setOver(null);
        },
      },
    };
  }

  function renderGroups(groups: TodoGroup[]) {
    return (
      <>
        {groups
          .filter((g) => g.items.length)
          .map((g) => {
            const collapsed = collapsedGroups.has(g.id);
            const label = g.id.startsWith('done-') ? `${friendlyDate(g.title!)} · ${g.title}` : g.title;
            return (
              <section className="group" key={g.id}>
                {label && (
                  <button
                    className={`group-title ${g.tone ?? ''}`}
                    aria-expanded={!collapsed}
                    onClick={() => ui().toggleGroup(g.id)}
                  >
                    <Icon name="chevronDown" size={12} />
                    {g.tone === 'overdue' && <Icon name="alert" size={12} />}
                    <span>{label}</span>
                    <span className="count">{g.items.length}</span>
                  </button>
                )}
                {!collapsed && (
                  <ul className="todo-list" role="listbox" aria-label={label ?? '待办'}>
                    {g.items.map((t) => (
                      <TodoRow
                        key={t.id}
                        todo={t}
                        selected={selectedId === t.id}
                        inTrash={view === 'trash'}
                        showCompletedTime={view !== 'today'}
                        onSelect={() => ui().select(t.id)}
                        onToggle={() => void actions.toggle(t)}
                        onDelete={() => void actions.remove(t)}
                        onRestore={() => void actions.restore(t)}
                        onPurge={() => void actions.purge(t)}
                        onKeyDown={onRowKey(t)}
                        drag={manual ? dragFor(g, t) : undefined}
                      />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
      </>
    );
  }
}
