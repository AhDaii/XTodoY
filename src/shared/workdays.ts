// 工作日日历：中国大陆法定节假日与调休（数据来自 NateScarlet/holiday-cn）。纯函数 + 模块级数据，
// 主进程与渲染进程各自用 setHolidayData 装入同一份数据（主进程从内置数据 / 本地缓存加载，渲染进程经 IPC 取得）

/** holiday-cn 每年一个文件中的一天：isOffDay=true 为放假，false 为调休上班 */
export interface HolidayDay {
  name: string;
  date: string;
  isOffDay: boolean;
}

export interface HolidayYear {
  year: number;
  days: HolidayDay[];
}

const off = new Map<string, string>();
const work = new Map<string, string>();
let years = new Set<number>();

/** 装入节假日数据（整体替换） */
export function setHolidayData(list: readonly HolidayYear[]): void {
  off.clear();
  work.clear();
  years = new Set();
  for (const y of list) {
    if (!y.days.length) continue; // 尚未公布的年份（文件存在但为空）按普通周一至周五处理
    years.add(y.year);
    for (const d of y.days) (d.isOffDay ? off : work).set(d.date, d.name);
  }
}

/** 已装入数据的年份 */
export const holidayYears = (): number[] => [...years].sort();

function dow(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d).getDay();
}

function prevDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const p = new Date(y, m - 1, d - 1);
  return `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, '0')}-${String(p.getDate()).padStart(2, '0')}`;
}

/** 是否工作日：法定假日休息、调休日上班，其余按周一至周五（没有该年数据时同样按周一至周五） */
export function isWorkday(date: string): boolean {
  if (off.has(date)) return false;
  if (work.has(date)) return true;
  const w = dow(date);
  return w >= 1 && w <= 5;
}

/** 休息后的第一个工作日：本身是工作日，且前一天是休息日（周末或节假日）（FR-REC-02 工作日第一天） */
export const isFirstWorkday = (date: string): boolean => isWorkday(date) && !isWorkday(prevDay(date));

/** 节日名称（放假或调休上班当天），用于预览说明 */
export function holidayName(date: string): { name: string; offDay: boolean } | null {
  const o = off.get(date);
  if (o) return { name: o, offDay: true };
  const w = work.get(date);
  return w ? { name: w, offDay: false } : null;
}

/** 校验从网络下载的数据（只接受 holiday-cn 的格式），不合法时返回 null */
export function parseHolidayYear(raw: unknown, expectYear: number): HolidayYear | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as { year?: unknown; days?: unknown };
  if (o.year !== expectYear || !Array.isArray(o.days) || o.days.length > 400) return null;
  const days: HolidayDay[] = [];
  for (const d of o.days as unknown[]) {
    const x = d as { name?: unknown; date?: unknown; isOffDay?: unknown };
    if (
      typeof x?.name !== 'string' ||
      x.name.length > 20 ||
      typeof x.date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(x.date) ||
      typeof x.isOffDay !== 'boolean'
    )
      return null;
    days.push({ name: x.name, date: x.date, isOffDay: x.isOffDay });
  }
  return { year: expectYear, days };
}

/**
 * 节假日数据覆盖到哪一年（#46）。下一年的安排通常在 11 月前后公布，未公布时说明，按周一至周五计算。
 */
export function holidayCoverage(years: readonly number[], thisYear: number): string {
  const last = years.at(-1);
  if (last === undefined || last < thisYear) return `缺少 ${thisYear} 年的放假安排，暂按周一至周五计算`;
  if (last === thisYear) return `已包含到 ${last} 年的放假安排（${last + 1} 年尚未公布）`;
  return `已包含到 ${last} 年的放假安排`;
}
