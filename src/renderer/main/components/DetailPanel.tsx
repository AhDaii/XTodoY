import { useEffect, useRef, useState } from 'react';
import { fromRRule, repeatSummary } from '@shared/recurrence';
import { reminderLabel } from '@shared/reminders';
import { LIMITS, type Priority, type TagNode, type Todo } from '@shared/types';
import { api, call } from '../lib/api';
import { useTodoActions } from '../lib/actions';
import { useReportError } from '../lib/data';
import { addDays, friendlyDate, nextMonday, parse, today, WEEKDAY_LABELS, ymd } from '../lib/dates';
import { useUi } from '../lib/store';
import { Icon } from './Icon';
import { Popover } from './Overlay';
import { ReminderPicker } from './ReminderPicker';
import { RepeatPicker } from './RepeatPicker';

const PRIORITIES: [Priority, string][] = [
  [0, '无'],
  [1, '低'],
  [2, '中'],
  [3, '高'],
];
const PRIO_VAR = ['', 'var(--priority-low)', 'var(--priority-medium)', 'var(--priority-high)'];

export function DetailPanel({
  id,
  tags,
  weekStart,
  allDayTime,
}: {
  id: string;
  tags: TagNode[];
  weekStart: 0 | 1;
  allDayTime: string;
}) {
  const [todo, setTodo] = useState<Todo | null>(null);
  const [pop, setPop] = useState<{ kind: 'date' | 'tags' | 'repeat' | 'reminders'; anchor: HTMLElement } | null>(null);
  const select = useUi((s) => s.select);
  const report = useReportError();
  const actions = useTodoActions();

  useEffect(() => {
    const load = () =>
      call(api.todos.get(id))
        .then(setTodo)
        .catch(() => select(null));
    void load();
    return api.on.todosChanged(() => void load());
  }, [id, select]);

  if (!todo) return null;
  const patch = (p: Parameters<typeof api.todos.update>[1]) =>
    call(api.todos.update(todo.id, p)).then(setTodo).catch(report);
  const overdue = todo.status === 'open' && todo.dueDate !== null && todo.dueDate < today();
  const prio = ['none', 'low', 'medium', 'high'][todo.priority];

  return (
    <aside className="detail" aria-label="待办详情" key={todo.id}>
      <div className="detail-head">
        <button
          className={`check prio-${prio}`}
          role="checkbox"
          aria-checked={todo.status === 'done'}
          aria-label={`完成：${todo.title}`}
          onClick={() => void actions.toggle(todo)}
        >
          <span className="ring">
            <Icon name="check" size={12} />
          </span>
        </button>
        <EditableText
          className="detail-title"
          label="标题"
          value={todo.title}
          maxLength={LIMITS.titleMax}
          required
          onSave={(title) => patch({ title })}
        />
        <button className="icon-btn" onClick={() => select(null)} aria-label="关闭详情（Esc）" title="关闭（Esc）">
          <Icon name="x" />
        </button>
      </div>

      <div className="detail-body">
        <div className="prop-list">
          <button className="prop" onClick={(e) => setPop({ kind: 'date', anchor: e.currentTarget })}>
            <span className="k">
              <Icon name="calendar" size={14} />
              日期
            </span>
            <span className={`v ${todo.dueDate ? (overdue ? 'overdue' : '') : 'placeholder'}`}>
              {todo.dueDate
                ? `${overdue ? '逾期 · ' : ''}${friendlyDate(todo.dueDate)}（${todo.dueDate}）${todo.dueTime ? ` ${todo.dueTime}` : ' · 全天'}`
                : '添加截止日期'}
            </span>
            <Icon name="chevronRight" size={14} className="chev" />
          </button>
          <button className="prop" onClick={(e) => setPop({ kind: 'repeat', anchor: e.currentTarget })}>
            <span className="k">
              <Icon name="repeat" size={14} />
              循环
            </span>
            <span className={`v ${todo.rrule ? '' : 'placeholder'}`}>
              {repeatSummary(todo.rrule ? fromRRule(todo.rrule) : null)}
            </span>
            <Icon name="chevronRight" size={14} className="chev" />
          </button>
          <button className="prop" onClick={(e) => setPop({ kind: 'reminders', anchor: e.currentTarget })}>
            <span className="k">
              <Icon name="bell" size={14} />
              提醒
            </span>
            <span className={`v ${todo.reminders.length ? '' : 'placeholder'}`}>
              {todo.reminders.length
                ? todo.reminders.map((r) => reminderLabel(r.spec, !todo.dueTime, allDayTime)).join('、')
                : '添加提醒'}
            </span>
            <Icon name="chevronRight" size={14} className="chev" />
          </button>
          <button className="prop" onClick={(e) => setPop({ kind: 'tags', anchor: e.currentTarget })}>
            <span className="k">
              <Icon name="tag" size={14} />
              标签
            </span>
            <span className={`v ${todo.tags.length ? '' : 'placeholder'}`}>
              {todo.tags.length
                ? todo.tags.map((t) => (
                    <span key={t.id} className={`chip tc-${t.color}`} title={t.path}>
                      <span className="dot" />
                      <span>{t.path}</span>
                    </span>
                  ))
                : '添加标签'}
            </span>
            <Icon name="chevronRight" size={14} className="chev" />
          </button>
        </div>

        {todo.rrule && todo.status === 'open' && (
          <div className="row" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn sm" onClick={() => void actions.skip(todo)}>
              <Icon name="skip" size={14} />
              跳过本次
            </button>
            <span className="help">已完成 {todo.repeatCountDone} 次</span>
          </div>
        )}
        <div>
          <span className="field-label" id="prio-label">
            优先级
          </span>
          <div className="seg" role="group" aria-labelledby="prio-label">
            {PRIORITIES.map(([p, label]) => (
              <button key={p} aria-pressed={todo.priority === p} onClick={() => void patch({ priority: p })}>
                {p > 0 && <span className="dot" style={{ background: PRIO_VAR[p] }} />}
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="field-label" htmlFor="note">
            备注
          </label>
          <EditableText
            id="note"
            className="textarea"
            label="备注"
            multiline
            placeholder="添加备注"
            value={todo.note}
            maxLength={LIMITS.noteMax}
            onSave={(note) => patch({ note })}
          />
        </div>
      </div>

      <div className="detail-foot">
        <span>创建于 {ymd(new Date(todo.createdAt))} · 自动保存</span>
        <button
          className="btn sm ghost"
          style={{ color: 'var(--destructive)' }}
          onClick={() => void actions.remove(todo)}
        >
          <Icon name="trash" size={14} />
          删除
        </button>
      </div>

      {pop?.kind === 'date' && (
        <Popover anchor={pop.anchor} onClose={() => setPop(null)} label="截止日期">
          <DatePicker todo={todo} weekStart={weekStart} onChange={(p) => void patch(p)} onDone={() => setPop(null)} />
        </Popover>
      )}
      {pop?.kind === 'repeat' && (
        <Popover anchor={pop.anchor} onClose={() => setPop(null)} label="循环">
          <RepeatPicker todo={todo} onChange={setTodo} />
        </Popover>
      )}
      {pop?.kind === 'reminders' && (
        <Popover anchor={pop.anchor} onClose={() => setPop(null)} label="提醒">
          <ReminderPicker todo={todo} allDayTime={allDayTime} onChange={setTodo} />
        </Popover>
      )}
      {pop?.kind === 'tags' && (
        <Popover anchor={pop.anchor} onClose={() => setPop(null)} label="标签">
          <TagPicker todo={todo} tags={tags} onChange={setTodo} />
        </Popover>
      )}
    </aside>
  );
}

/** 失焦或回车（单行）时保存；内容未变不保存 */
function EditableText(props: {
  id?: string;
  className: string;
  label: string;
  value: string;
  maxLength: number;
  multiline?: boolean;
  required?: boolean;
  placeholder?: string;
  onSave(v: string): void;
}) {
  const [v, setV] = useState(props.value);
  const [prev, setPrev] = useState(props.value);
  const ref = useRef<HTMLTextAreaElement>(null);
  // 外部值变化（保存成功、切换事项）时同步到输入框
  if (prev !== props.value) {
    setPrev(props.value);
    setV(props.value);
  }
  const save = () => {
    const next = props.multiline ? v : v.trim();
    if (props.required && !next) return setV(props.value);
    if (next !== props.value) props.onSave(next);
  };
  return (
    <textarea
      ref={ref}
      id={props.id}
      className={props.className}
      aria-label={props.label}
      rows={props.multiline ? 4 : 2}
      value={v}
      maxLength={props.maxLength}
      placeholder={props.placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (!props.multiline && e.key === 'Enter') {
          e.preventDefault();
          ref.current?.blur();
        }
      }}
    />
  );
}

function DatePicker({
  todo,
  weekStart,
  onChange,
  onDone,
}: {
  todo: Todo;
  weekStart: 0 | 1;
  onChange(p: { dueDate?: string | null; dueTime?: string | null }): void;
  onDone(): void;
}) {
  const base = todo.dueDate ?? today();
  const [month, setMonth] = useState(base.slice(0, 7));
  const [y, m] = month.split('-').map(Number) as [number, number];
  const pad = (new Date(y, m - 1, 1).getDay() - weekStart + 7) % 7;
  const cells = Array.from({ length: 42 }, (_, i) => ymd(new Date(y, m - 1, 1 - pad + i)));
  const shift = (n: number) => setMonth(ymd(new Date(y, m - 1 + n, 1)).slice(0, 7));
  const pick = (d: string | null) => {
    onChange({ dueDate: d });
    onDone();
  };
  const now = today();
  return (
    <div className="stack">
      <div className="quick-dates">
        <button onClick={() => pick(now)}>
          <Icon name="sun" />
          今天
        </button>
        <button onClick={() => pick(addDays(now, 1))}>
          <Icon name="calendar" />
          明天
        </button>
        <button onClick={() => pick(nextMonday(now))}>
          <Icon name="calendar" />
          下周一
        </button>
        <button onClick={() => pick(null)}>
          <Icon name="x" />
          清除
        </button>
      </div>
      <div>
        <div className="cal-head">
          <button className="icon-btn" onClick={() => shift(-1)} aria-label="上个月">
            <Icon name="chevronLeft" />
          </button>
          <span>
            {y} 年 {m} 月
          </span>
          <button className="icon-btn" onClick={() => shift(1)} aria-label="下个月">
            <Icon name="chevronRight" />
          </button>
        </div>
        <div className="cal" role="grid">
          {Array.from({ length: 7 }, (_, i) => (
            <span className="wd" key={i}>
              {WEEKDAY_LABELS[(i + weekStart) % 7]}
            </span>
          ))}
          {cells.map((d) => (
            <button
              key={d}
              className={`${d.slice(0, 7) !== month ? 'out' : ''} ${d === now ? 'is-today' : ''}`}
              aria-pressed={todo.dueDate === d}
              aria-label={`${d} 周${WEEKDAY_LABELS[parse(d).getDay()]}`}
              onClick={() => pick(d)}
            >
              {Number(d.slice(8))}
            </button>
          ))}
        </div>
      </div>
      <label className="check-row">
        <input
          type="checkbox"
          checked={!todo.dueTime}
          disabled={!todo.dueDate}
          onChange={(e) => onChange({ dueTime: e.target.checked ? null : '09:00' })}
        />
        全天
      </label>
      <div className="row">
        <label className="field-label" htmlFor="due-time" style={{ margin: 0, width: 40 }}>
          时间
        </label>
        <input
          id="due-time"
          type="time"
          className="input"
          value={todo.dueTime ?? '09:00'}
          disabled={!todo.dueTime}
          onChange={(e) => e.target.value && onChange({ dueTime: e.target.value })}
        />
      </div>
    </div>
  );
}

function TagPicker({ todo, tags, onChange }: { todo: Todo; tags: TagNode[]; onChange(t: Todo): void }) {
  const [q, setQ] = useState('');
  const report = useReportError();
  const selected = new Set(todo.tags.map((t) => t.id));
  const ql = q.trim().toLowerCase();
  const list = tags.filter((t) => !ql || t.displayPath.toLowerCase().includes(ql));
  const exact = tags.some((t) => t.name.toLowerCase() === ql);
  const set = (ids: string[]) => call(api.todos.setTags(todo.id, ids)).then(onChange).catch(report);
  const toggle = (id: string, on: boolean) => set(on ? [...selected, id] : [...selected].filter((x) => x !== id));
  const create = async () => {
    try {
      const t = await call(api.tags.create({ name: q.trim(), parentId: null }));
      await set([...selected, t.id]);
      setQ('');
    } catch (e) {
      report(e);
    }
  };
  return (
    <div className="stack" style={{ width: 280 }}>
      <input
        className="input"
        placeholder="搜索或新建标签"
        aria-label="搜索标签"
        value={q}
        autoFocus
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && ql && !exact && void create()}
      />
      <div style={{ maxHeight: 260, overflow: 'auto' }}>
        {list.length ? (
          list.map((t) => (
            <label
              key={t.id}
              className={`check-row tc-${t.color}`}
              style={{ paddingLeft: 8 + (ql ? 0 : t.depth * 16) }}
            >
              <input
                type="checkbox"
                checked={selected.has(t.id)}
                disabled={!selected.has(t.id) && selected.size >= LIMITS.tagsPerTodo}
                onChange={(e) => void toggle(t.id, e.target.checked)}
              />
              <span className="dot" />
              {ql ? t.displayPath : t.name}
            </label>
          ))
        ) : (
          <p className="help">没有匹配的标签</p>
        )}
      </div>
      {ql && !exact && (
        <button className="btn sm" onClick={() => void create()}>
          <Icon name="plus" size={14} />
          新建标签"{q.trim()}"
        </button>
      )}
      <p className="help" style={{ margin: 0 }}>
        已选 {selected.size} / {LIMITS.tagsPerTodo}
      </p>
    </div>
  );
}
