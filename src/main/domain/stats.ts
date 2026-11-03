// 纯函数：统计周期与连续天数（SRS F8，FR-STA-02/06）
import type { StatsPeriodKind } from '@shared/stats';
import { localDate } from './time';

function parse(s: string): Date {
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

export function addDays(s: string, n: number): string {
  const d = parse(s);
  return localDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
}

export function diffDays(a: string, b: string): number {
  return Math.round((parse(a).getTime() - parse(b).getTime()) / 86_400_000);
}

export interface PeriodRange {
  from: string;
  to: string;
  /** 上一周期 */
  prevFrom: string;
  prevTo: string;
  /** 与本期"同期"比较时上一周期的截止日（本期未结束时只比较相同天数） */
  prevSameTo: string;
  days: number;
  /** 本期已经过的天数（含今天），历史周期等于 days */
  elapsed: number;
}

/** 计算日 / 周 / 月周期；offset 为 0 表示本期，-1 为上一期 */
export function periodRange(kind: StatsPeriodKind, offset: number, today: string, weekStart: 0 | 1): PeriodRange {
  let from: string, to: string, prevFrom: string, prevTo: string;
  if (kind === 'day') {
    from = to = addDays(today, offset);
    prevFrom = prevTo = addDays(from, -1);
  } else if (kind === 'week') {
    const back = (parse(today).getDay() - weekStart + 7) % 7;
    from = addDays(today, -back + offset * 7);
    to = addDays(from, 6);
    prevFrom = addDays(from, -7);
    prevTo = addDays(from, -1);
  } else {
    const t = parse(today);
    const first = new Date(t.getFullYear(), t.getMonth() + offset, 1);
    from = localDate(first);
    to = localDate(new Date(first.getFullYear(), first.getMonth() + 1, 0));
    prevFrom = localDate(new Date(first.getFullYear(), first.getMonth() - 1, 1));
    prevTo = addDays(from, -1);
  }
  const days = diffDays(to, from) + 1;
  const elapsed = Math.max(1, Math.min(days, diffDays(today, from) + 1));
  const sameTo = addDays(prevFrom, elapsed - 1);
  return { from, to, prevFrom, prevTo, prevSameTo: sameTo < prevTo ? sameTo : prevTo, days, elapsed };
}

/** 连续完成天数：今天还没有完成时从昨天往前数，不算中断 */
export function streaks(
  sortedDates: readonly string[],
  today: string,
): {
  current: number;
  best: number;
  last7: { date: string; on: boolean }[];
} {
  const set = new Set(sortedDates);
  let current = 0;
  let d = set.has(today) ? today : addDays(today, -1);
  while (set.has(d)) {
    current++;
    d = addDays(d, -1);
  }
  let best = 0;
  let run = 0;
  sortedDates.forEach((x, i) => {
    run = i > 0 && diffDays(x, sortedDates[i - 1]!) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  });
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i - 6);
    return { date, on: set.has(date) };
  });
  return { current, best, last7 };
}
