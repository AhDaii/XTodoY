// 循环规则（FR-REC-02~07）：主进程计算下一次实例，渲染进程用于摘要与预览。纯函数，无外部依赖。
// 存储为 RFC 5545 RRULE 子集，例如 FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE,FR;COUNT=10

export type RepeatFreq = 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly';

export type RepeatEnd = { type: 'never' } | { type: 'until'; date: string } | { type: 'count'; count: number };

export interface RepeatRule {
  freq: RepeatFreq;
  interval: number; // ≥ 1；工作日规则忽略
  byDay?: number[]; // 每周：0=周日 … 6=周六
  monthDay?: number; // 每月：1–31，-1 表示最后一天
  end: RepeatEnd;
}

const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const WEEK_LABEL = ['日', '一', '二', '三', '四', '五', '六'];

// ---------- 日期工具（本地日期字符串 YYYY-MM-DD） ----------
function parse(s: string): Date {
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}
function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function addDays(s: string, n: number): string {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return fmt(d);
}
const dayDiff = (a: string, b: string): number => Math.round((parse(a).getTime() - parse(b).getTime()) / 86_400_000);
const lastDayOfMonth = (y: number, m0: number): number => new Date(y, m0 + 1, 0).getDate();
/** 周一为一周开始，用于"每 N 周"的周序号计算 */
const mondayOf = (s: string): string => addDays(s, -((parse(s).getDay() + 6) % 7));

// ---------- 序列化 ----------
export function toRRule(r: RepeatRule): string {
  const freq = { daily: 'DAILY', weekdays: 'WEEKLY', weekly: 'WEEKLY', monthly: 'MONTHLY', yearly: 'YEARLY' }[r.freq];
  const parts = [`FREQ=${freq}`, `INTERVAL=${r.freq === 'weekdays' ? 1 : r.interval}`];
  if (r.freq === 'weekdays') parts.push('BYDAY=MO,TU,WE,TH,FR');
  if (r.freq === 'weekly' && r.byDay?.length)
    parts.push(
      `BYDAY=${[...r.byDay]
        .sort()
        .map((d) => DAY_CODES[d])
        .join(',')}`,
    );
  if (r.freq === 'monthly' && r.monthDay) parts.push(`BYMONTHDAY=${r.monthDay}`);
  if (r.end.type === 'until') parts.push(`UNTIL=${r.end.date.replaceAll('-', '')}`);
  if (r.end.type === 'count') parts.push(`COUNT=${r.end.count}`);
  return parts.join(';');
}

export function fromRRule(s: string): RepeatRule {
  const kv = new Map(s.split(';').map((p) => p.split('=') as [string, string]));
  const byDay = kv
    .get('BYDAY')
    ?.split(',')
    .map((c) => DAY_CODES.indexOf(c))
    .filter((d) => d >= 0);
  const interval = Math.max(1, Number(kv.get('INTERVAL') ?? 1));
  const until = kv.get('UNTIL');
  const count = kv.get('COUNT');
  const end: RepeatEnd = until
    ? { type: 'until', date: `${until.slice(0, 4)}-${until.slice(4, 6)}-${until.slice(6, 8)}` }
    : count
      ? { type: 'count', count: Number(count) }
      : { type: 'never' };
  switch (kv.get('FREQ')) {
    case 'DAILY':
      return { freq: 'daily', interval, end };
    case 'WEEKLY':
      if (byDay?.length === 5 && [1, 2, 3, 4, 5].every((d) => byDay.includes(d)) && interval === 1) {
        return { freq: 'weekdays', interval: 1, end };
      }
      return { freq: 'weekly', interval, byDay, end };
    case 'MONTHLY':
      return { freq: 'monthly', interval, monthDay: Number(kv.get('BYMONTHDAY') ?? 0) || undefined, end };
    case 'YEARLY':
      return { freq: 'yearly', interval, end };
    default:
      throw new Error(`不支持的循环规则：${s}`);
  }
}

export function validateRule(r: RepeatRule): string | null {
  if (!Number.isInteger(r.interval) || r.interval < 1 || r.interval > 99) return '间隔应为 1–99';
  if (r.freq === 'weekly' && r.byDay && r.byDay.some((d) => !Number.isInteger(d) || d < 0 || d > 6))
    return '星期不正确';
  if (
    r.freq === 'monthly' &&
    r.monthDay !== undefined &&
    !(r.monthDay === -1 || (r.monthDay >= 1 && r.monthDay <= 31))
  ) {
    return '每月日期应为 1–31 或最后一天';
  }
  if (r.end.type === 'count' && (!Number.isInteger(r.end.count) || r.end.count < 1 || r.end.count > 999)) {
    return '重复次数应为 1–999';
  }
  if (r.end.type === 'until' && !/^\d{4}-\d{2}-\d{2}$/.test(r.end.date)) return '结束日期不正确';
  return null;
}

// ---------- 实例计算 ----------
/** date 是否为以 anchor（首次实例）为起点的规则的一个实例（不考虑结束条件） */
export function matches(r: RepeatRule, anchor: string, date: string): boolean {
  if (date < anchor) return false;
  const d = parse(date);
  const a = parse(anchor);
  switch (r.freq) {
    case 'daily':
      return dayDiff(date, anchor) % r.interval === 0;
    case 'weekdays':
      return d.getDay() >= 1 && d.getDay() <= 5;
    case 'weekly': {
      const days = r.byDay?.length ? r.byDay : [a.getDay()];
      const weeks = Math.round(dayDiff(mondayOf(date), mondayOf(anchor)) / 7);
      return days.includes(d.getDay()) && weeks % r.interval === 0;
    }
    case 'monthly': {
      const months = (d.getFullYear() - a.getFullYear()) * 12 + d.getMonth() - a.getMonth();
      const last = lastDayOfMonth(d.getFullYear(), d.getMonth());
      const want = r.monthDay ?? a.getDate();
      // 月末规则（FR-REC-04）：当月没有该日期时落在最后一天
      const target = want === -1 ? last : Math.min(want, last);
      return months % r.interval === 0 && d.getDate() === target;
    }
    case 'yearly': {
      const years = d.getFullYear() - a.getFullYear();
      const target = Math.min(a.getDate(), lastDayOfMonth(d.getFullYear(), a.getMonth()));
      return years % r.interval === 0 && d.getMonth() === a.getMonth() && d.getDate() === target;
    }
  }
}

/**
 * after 之后（不含）的第一个实例；超出结束条件返回 null。
 * doneCount 为已完成次数，用于"重复 N 次后结束"。
 */
export function nextOccurrence(r: RepeatRule, anchor: string, after: string, doneCount = 0): string | null {
  if (r.end.type === 'count' && doneCount >= r.end.count) return null;
  // 搜索上限：覆盖"每 99 年"之外的所有合理规则
  const limit =
    r.freq === 'yearly' ? 366 * r.interval + 366 : r.freq === 'monthly' ? 31 * r.interval + 62 : 7 * r.interval + 14;
  let d = addDays(after < anchor ? addDays(anchor, -1) : after, 1);
  for (let i = 0; i <= limit; i++, d = addDays(d, 1)) {
    if (r.end.type === 'until' && d > r.end.date) return null;
    if (matches(r, anchor, d)) return d;
  }
  return null;
}

/** 从 from（含）开始的接下来 n 个实例，用于编辑器预览 */
export function previewOccurrences(r: RepeatRule, anchor: string, from: string, n = 5, doneCount = 0): string[] {
  const out: string[] = [];
  let cur = addDays(from, -1);
  for (let i = 0; i < n; i++) {
    const next = nextOccurrence(r, anchor, cur, doneCount + i);
    if (!next) break;
    out.push(next);
    cur = next;
  }
  return out;
}

/**
 * 完成本次后的下一个实例（FR-REC-05）：按原计划日期计算；若仍早于今天，
 * 跳到第一个不早于今天的实例（逾期期间错过的实例不补做、不计为完成）。
 */
export function advanceAfterComplete(
  r: RepeatRule,
  anchor: string,
  current: string,
  today: string,
  doneCountAfter: number,
): string | null {
  let next = nextOccurrence(r, anchor, current, doneCountAfter);
  if (next && next < today) next = nextOccurrence(r, anchor, addDays(today, -1), doneCountAfter);
  return next;
}

// ---------- 显示 ----------
export function repeatSummary(r: RepeatRule | null): string {
  if (!r) return '不重复';
  const every = (unit: string): string => (r.interval > 1 ? `每 ${r.interval} ${unit}` : `每${unit}`);
  let s: string;
  switch (r.freq) {
    case 'daily':
      s = every('天');
      break;
    case 'weekdays':
      s = '每个工作日';
      break;
    case 'weekly': {
      const days = [...(r.byDay ?? [])].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
      s = `${every('周')}${days.length ? ` ${days.map((d) => `周${WEEK_LABEL[d]}`).join('、')}` : ''}`;
      break;
    }
    case 'monthly':
      s = `${every('月')}${r.monthDay ? ` ${r.monthDay === -1 ? '最后一天' : `${r.monthDay} 日`}` : ''}`;
      break;
    case 'yearly':
      s = every('年');
      break;
  }
  if (r.end.type === 'until') s += `，至 ${r.end.date}`;
  if (r.end.type === 'count') s += `，共 ${r.end.count} 次`;
  return s;
}
