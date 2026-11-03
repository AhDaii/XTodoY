// 纯函数：通知正文（FR-REM-03）——截止时间 · 标签路径 · 备注首行（截断 60 字符）
import type { Todo } from '@shared/types';
import { localDate } from './time';

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return localDate(new Date(y, m - 1, d + n));
}

export function describeDue(t: Pick<Todo, 'dueDate' | 'dueTime'>, today: string): string {
  if (!t.dueDate) return '';
  const day =
    t.dueDate === today
      ? '今天'
      : t.dueDate === addDays(today, 1)
        ? '明天'
        : t.dueDate === addDays(today, -1)
          ? '昨天'
          : `${Number(t.dueDate.slice(5, 7))}月${Number(t.dueDate.slice(8))}日`;
  return `${day} ${t.dueTime ?? '全天'}`;
}

export function notificationBody(t: Pick<Todo, 'dueDate' | 'dueTime' | 'tags' | 'note'>, today: string): string {
  const note = t.note.split('\n')[0]?.trim() ?? '';
  return [describeDue(t, today), t.tags[0]?.path, note.length > 60 ? `${note.slice(0, 60)}…` : note]
    .filter(Boolean)
    .join(' · ');
}
