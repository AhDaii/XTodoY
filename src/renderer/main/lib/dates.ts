// 渲染进程的日期显示工具（本地时区）
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function parse(s: string): Date {
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

export const today = (): string => ymd(new Date());

export function addDays(s: string, n: number): string {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
}

export function diffDays(a: string, b: string): number {
  return Math.round((parse(a).getTime() - parse(b).getTime()) / 86_400_000);
}

export const weekday = (s: string): string => `周${WEEK[parse(s).getDay()]}`;

/** 今天 / 明天 / 昨天 / 周几（一周内）/ 11月20日 */
export function friendlyDate(s: string, base = today()): string {
  const n = diffDays(s, base);
  if (n === 0) return '今天';
  if (n === 1) return '明天';
  if (n === -1) return '昨天';
  if (n > 1 && n < 7) return weekday(s);
  const d = parse(s);
  const md = `${d.getMonth() + 1}月${d.getDate()}日`;
  return d.getFullYear() === parse(base).getFullYear() ? md : `${d.getFullYear()}年${md}`;
}

export function nextMonday(base = today()): string {
  const dow = parse(base).getDay();
  return addDays(base, (8 - dow) % 7 || 7);
}

/** 本周最后一天（weekStart：0 周日 / 1 周一） */
export function weekEndDate(base: string, weekStart: 0 | 1): string {
  const dow = parse(base).getDay();
  const offset = (dow - weekStart + 7) % 7;
  return addDays(base, 6 - offset);
}

/** 紧凑日期：今天 / 明天 / 11/23 / 2027/1/5 */
export function shortDate(s: string, base = today()): string {
  const n = diffDays(s, base);
  if (n === 0) return '今天';
  if (n === 1) return '明天';
  if (n === -1) return '昨天';
  const d = parse(s);
  const md = `${d.getMonth() + 1}/${d.getDate()}`;
  return d.getFullYear() === parse(base).getFullYear() ? md : `${d.getFullYear()}/${md}`;
}

export interface SpanProgress {
  total: number;
  elapsed: number;
  remain: number;
  started: boolean;
  lastDay: boolean;
  overdue: boolean;
  pct: number;
}

/** 计算时间跨度进度（#51）；非跨度返回 null */
export function spanProgress(startDate: string | null, dueDate: string | null, base = today()): SpanProgress | null {
  if (!startDate || !dueDate || startDate >= dueDate) return null;
  const total = diffDays(dueDate, startDate) + 1;
  const elapsed = diffDays(base, startDate) + 1;
  const remain = diffDays(dueDate, base);
  const started = base >= startDate;
  const lastDay = base === dueDate;
  const overdue = base > dueDate;
  const clamped = Math.max(0, Math.min(total, elapsed));
  const pct = Math.max(0, Math.min(100, Math.round((clamped / total) * 100)));
  return { total, elapsed, remain, started, lastDay, overdue, pct };
}

export const WEEKDAY_LABELS = WEEK;
