// 纯函数：提醒触发时间与"错过的提醒"处理规则（FR-REM-01/07，D-4）
import type { ReminderSpec } from '@shared/types';

const MINUTE = 60_000;
export const MISSED_WINDOW_MS = 24 * 60 * MINUTE;
export const MERGE_THRESHOLD = 3;

/** 本地日期 + 时分 → 毫秒时间戳 */
export function localDateTime(date: string, time: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const [hh, mm] = time.split(':').map(Number) as [number, number];
  return new Date(y, m - 1, d, hh, mm, 0, 0).getTime();
}

/**
 * 计算一条提醒在当前实例上的触发时刻。
 * 相对提醒以截止时间为基准；全天事项以"全天事项默认提醒时间"为基准（FR-SET-04）。
 * 没有截止日期时相对提醒无效，返回 null。
 */
export function fireTime(
  spec: ReminderSpec,
  dueDate: string | null,
  dueTime: string | null,
  allDayTime: string,
): number | null {
  if (spec.kind === 'absolute') return spec.at;
  if (!dueDate) return null;
  return localDateTime(dueDate, dueTime ?? allDayTime) - spec.offsetMinutes * MINUTE;
}

export interface DueReminder {
  id: string;
  todoId: string;
  fireAt: number;
}

/**
 * 把已到期的提醒分为：逐条通知 / 合并为一条"你错过了 N 个提醒" / 超过 24 小时静默标记。
 * 定时器正常触发时一般只有 1 条，走逐条通知。
 */
export function planDelivery(
  due: DueReminder[],
  now: number,
): { notify: DueReminder[]; merged: DueReminder[]; silent: DueReminder[] } {
  const recent = due.filter((r) => now - r.fireAt <= MISSED_WINDOW_MS).sort((a, b) => a.fireAt - b.fireAt);
  const silent = due.filter((r) => now - r.fireAt > MISSED_WINDOW_MS);
  // 同一事项的多条提醒只通知一次
  const seen = new Set<string>();
  const unique = recent.filter((r) => !seen.has(r.todoId) && seen.add(r.todoId));
  const dupes = recent.filter((r) => !unique.includes(r));
  if (unique.length > MERGE_THRESHOLD) return { notify: [], merged: unique, silent: [...silent, ...dupes] };
  return { notify: unique, merged: [], silent: [...silent, ...dupes] };
}
