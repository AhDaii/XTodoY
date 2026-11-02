import type { KeyboardEvent } from 'react';
import { fromRRule, repeatSummary } from '@shared/recurrence';
import type { Todo } from '@shared/types';
import { LIMITS } from '@shared/types';
import { diffDays, friendlyDate, today, ymd } from '../lib/dates';
import { Icon } from './Icon';

const PRIO = ['none', 'low', 'medium', 'high'] as const;
const PRIO_LABEL = ['', '低', '中', '高'];

interface Props {
  todo: Todo;
  selected: boolean;
  inTrash: boolean;
  showCompletedTime: boolean;
  onSelect(): void;
  onToggle(): void;
  onDelete(): void;
  onRestore(): void;
  onPurge(): void;
  onKeyDown(e: KeyboardEvent<HTMLLIElement>): void;
}

export function TodoRow({ todo: t, selected, inTrash, showCompletedTime, ...h }: Props) {
  const now = today();
  const overdue = t.status === 'open' && t.dueDate !== null && t.dueDate < now;
  const shown = t.tags.slice(0, 2);
  const done = t.status === 'done';
  return (
    <li
      className={`todo ${done ? 'is-done' : ''}`}
      role="option"
      aria-selected={selected}
      tabIndex={0}
      data-id={t.id}
      onClick={h.onSelect}
      onKeyDown={h.onKeyDown}
    >
      {inTrash ? (
        <span style={{ width: 32 }} />
      ) : (
        <button
          className={`check prio-${PRIO[t.priority]}`}
          role="checkbox"
          aria-checked={done}
          aria-label={`完成：${t.title}`}
          onClick={(e) => {
            e.stopPropagation();
            h.onToggle();
          }}
        >
          <span className="ring">
            <Icon name="check" size={12} />
          </span>
        </button>
      )}
      <div className="todo-body">
        <div className="todo-title">
          <span className="text">{t.title}</span>
        </div>
        {t.note && <div className="todo-note">{t.note.split('\n')[0]}</div>}
        <div className="todo-meta">
          {t.dueDate && (
            <span className={`when ${overdue ? 'overdue' : t.dueDate === now ? 'today' : ''}`}>
              <Icon name="calendar" size={12} />
              {overdue && '逾期 · '}
              {friendlyDate(t.dueDate)}
              {t.dueTime && ` ${t.dueTime}`}
            </span>
          )}
          {t.rrule && (
            <span className="ico" title={`循环：${repeatSummary(fromRRule(t.rrule))}`}>
              <Icon name="repeat" size={12} />
              <span className="sr-only">循环</span>
            </span>
          )}
          {t.reminders.length > 0 && (
            <span className="ico" title={`提醒 ${t.reminders.length} 个`}>
              <Icon name="bell" size={12} />
              <span className="sr-only">有提醒</span>
            </span>
          )}
          {t.priority > 0 && <span className="sr-only">优先级{PRIO_LABEL[t.priority]}</span>}
          {shown.map((tag) => (
            <span key={tag.id} className={`chip tc-${tag.color}`} title={tag.path}>
              <span className="dot" />
              <span>{tag.name}</span>
            </span>
          ))}
          {t.tags.length > 2 && (
            <span
              className="chip more"
              title={t.tags
                .slice(2)
                .map((x) => x.path)
                .join('、')}
            >
              +{t.tags.length - 2}
            </span>
          )}
          {showCompletedTime && done && t.completedAt && (
            <span>完成于 {new Date(t.completedAt).toTimeString().slice(0, 5)}</span>
          )}
          {inTrash && t.deletedAt && (
            <span>{LIMITS.trashDays - diffDays(now, ymd(new Date(t.deletedAt)))} 天后自动清理</span>
          )}
        </div>
      </div>
      <div className="todo-actions">
        {inTrash ? (
          <>
            <button
              className="btn sm"
              onClick={(e) => {
                e.stopPropagation();
                h.onRestore();
              }}
            >
              <Icon name="restore" size={14} />
              恢复
            </button>
            <button
              className="btn sm ghost"
              onClick={(e) => {
                e.stopPropagation();
                h.onPurge();
              }}
            >
              永久删除
            </button>
          </>
        ) : (
          <button
            className="icon-btn danger"
            aria-label={`删除 ${t.title}`}
            title="删除（Delete）"
            onClick={(e) => {
              e.stopPropagation();
              h.onDelete();
            }}
          >
            <Icon name="trash" size={14} />
          </button>
        )}
      </div>
    </li>
  );
}
