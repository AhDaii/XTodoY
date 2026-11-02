import { useRef, useState, type KeyboardEvent } from 'react';
import type { TagNode, Todo, TodoGroup, ViewCounts } from '@shared/types';
import { EmptyState } from '../components/Overlay';
import { Icon, type IconName } from '../components/Icon';
import { TodoRow } from '../components/TodoRow';
import { useTodoActions } from '../lib/actions';
import { api, call } from '../lib/api';
import { useGroups, useReportError } from '../lib/data';
import { friendlyDate, parse, today, weekday } from '../lib/dates';
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

export function ListPage({ tags, counts }: { tags: TagNode[]; counts: ViewCounts }) {
  const { route, search, includeChildren, selectedId, collapsedGroups } = useUi();
  const ui = useUi.getState;
  const groups = useGroups(route, search, includeChildren);
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

  const flat = (groups ?? []).flatMap((g) => (collapsedGroups.has(g.id) ? [] : g.items));
  const onRowKey = (t: Todo) => (e: KeyboardEvent<HTMLLIElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === ' ' && view !== 'trash') {
      e.preventDefault();
      void actions.toggle(t);
    } else if (e.key === 'Enter') ui().select(t.id);
    else if (e.key === 'Delete' && view !== 'trash') void actions.remove(t);
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
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
        <button className="icon-btn" onClick={ui().toggleSidebar} aria-label="折叠侧边栏" title="折叠侧边栏">
          <Icon name="panelLeft" />
        </button>
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
        {view === 'trash' && total > 0 && (
          <button className="btn sm ghost" onClick={() => void call(api.todos.purgeAll()).catch(report)}>
            清空回收站
          </button>
        )}
      </header>

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
