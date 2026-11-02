// 纯函数：智能视图的分组规则（SRS FR-TODO-05，D-1）
import type { SmartView, Todo, TodoGroup } from '@shared/types';
import { localDate } from './time';

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return localDate(new Date(y, m - 1, d + n));
}

/** 本周最后一天（weekStart：0 周日 / 1 周一） */
export function weekEnd(today: string, weekStart: 0 | 1): string {
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  const dow = new Date(y, m - 1, d).getDay();
  const offset = (dow - weekStart + 7) % 7;
  return addDays(today, 6 - offset);
}

const PRIORITY_DESC = (a: Todo, b: Todo): number => b.priority - a.priority;

/** 有日期的按 日期 → 时间（全天在前）→ 优先级 → 手动顺序；无日期的排在最后 */
export function byDue(a: Todo, b: Todo): number {
  return (
    (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') ||
    (a.dueTime ?? '').localeCompare(b.dueTime ?? '') ||
    PRIORITY_DESC(a, b) ||
    a.sortKey.localeCompare(b.sortKey)
  );
}

export function groupForView(view: SmartView, todos: Todo[], today: string, weekStart: 0 | 1): TodoGroup[] {
  const live = todos.filter((t) => t.deletedAt === null);
  switch (view) {
    case 'today': {
      const items = live.filter((t) => t.dueDate === today).sort(byDue);
      return [
        { id: 'today-open', title: null, items: items.filter((t) => t.status === 'open') },
        { id: 'today-done', title: '今日已完成', collapsible: true, items: items.filter((t) => t.status === 'done') },
      ];
    }
    case 'plan': {
      const open = live.filter((t) => t.status === 'open' && t.dueDate !== null).sort(byDue);
      const tomorrow = addDays(today, 1);
      const end = weekEnd(today, weekStart);
      return [
        { id: 'overdue', title: '逾期', tone: 'overdue', items: open.filter((t) => t.dueDate! < today) },
        { id: 'plan-today', title: '今天', items: open.filter((t) => t.dueDate === today) },
        { id: 'plan-tomorrow', title: '明天', items: open.filter((t) => t.dueDate === tomorrow) },
        { id: 'plan-week', title: '本周', items: open.filter((t) => t.dueDate! > tomorrow && t.dueDate! <= end) },
        { id: 'plan-later', title: '以后', items: open.filter((t) => t.dueDate! > end && t.dueDate! > tomorrow) },
      ];
    }
    case 'all': {
      const open = live.filter((t) => t.status === 'open').sort(byDue);
      return [
        { id: 'all-dated', title: '有日期', items: open.filter((t) => t.dueDate !== null) },
        { id: 'all-undated', title: '无日期', items: open.filter((t) => t.dueDate === null) },
      ];
    }
    case 'done': {
      const done = live.filter((t) => t.status === 'done').sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
      const groups = new Map<string, Todo[]>();
      for (const t of done) {
        const d = localDate(new Date(t.completedAt ?? 0));
        groups.set(d, [...(groups.get(d) ?? []), t]);
      }
      return [...groups].map(([d, items]) => ({ id: `done-${d}`, title: d, items }));
    }
    case 'trash': {
      const deleted = todos.filter((t) => t.deletedAt !== null).sort((a, b) => b.deletedAt! - a.deletedAt!);
      return [{ id: 'trash', title: null, items: deleted }];
    }
  }
}
