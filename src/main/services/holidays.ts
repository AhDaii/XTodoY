import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Settings } from '@shared/types';
import { parseHolidayYear, setHolidayData, type HolidayYear } from '@shared/workdays';
import bundled from '../data/holidays.json';

const WEEK = 7 * 24 * 3600_000;
const FIRST_CHECK_DELAY = 90_000;
/** 只请求 holiday-cn 的公开数据文件（不发送任何用户数据）；jsDelivr 在国内更快，失败时退回 GitHub */
const SOURCES = [
  (y: number) => `https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/${y}.json`,
  (y: number) => `https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/${y}.json`,
];

export type Fetcher = (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

/**
 * 法定节假日与调休数据（工作日循环、"工作日第一天"）。安装包内置往年与本年数据；
 * 开启"自动更新节假日"时每周联网获取本年与下一年（下一年的安排通常 11 月公布），缓存在 <数据目录>/holidays/。
 */
export class HolidayService {
  private timer: NodeJS.Timeout | null = null;
  private data = new Map<number, HolidayYear>();

  constructor(
    private readonly dir: string,
    private readonly settings: { get(): Settings; set<K extends keyof Settings>(k: K, v: Settings[K]): unknown },
    private readonly onChange: (data: HolidayYear[]) => void,
    private readonly fetcher: Fetcher = (url) => fetch(url, { signal: AbortSignal.timeout(15_000) }),
    private readonly now: () => number = () => Date.now(),
  ) {
    for (const y of bundled as HolidayYear[]) this.data.set(y.year, y);
    this.loadCache();
    this.apply();
  }

  get all(): HolidayYear[] {
    return [...this.data.values()].sort((a, b) => a.year - b.year);
  }

  private loadCache(): void {
    let files: string[];
    try {
      files = readdirSync(this.dir);
    } catch {
      return; // 还没有缓存
    }
    for (const f of files) {
      const year = Number(/^(\d{4})\.json$/.exec(f)?.[1]);
      if (!year) continue;
      try {
        const y = parseHolidayYear(JSON.parse(readFileSync(join(this.dir, f), 'utf8')), year);
        // 缓存为空（尚未公布）时不覆盖内置数据
        if (y && y.days.length) this.data.set(year, y);
      } catch {
        // 损坏的缓存文件：忽略，下次更新时覆盖
      }
    }
  }

  private apply(): void {
    setHolidayData(this.all);
  }

  start(): void {
    this.arm();
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** 设置变化（开 / 关自动更新）后重新安排 */
  arm(): void {
    this.stop();
    if (!this.settings.get().holidayAutoUpdate) return;
    const last = this.settings.get().holidayCheckedAt;
    const delay = last === null ? FIRST_CHECK_DELAY : Math.max(FIRST_CHECK_DELAY, last + WEEK - this.now());
    this.timer = setTimeout(() => void this.refresh().finally(() => this.arm()), Math.min(delay, WEEK));
    this.timer.unref?.();
  }

  /** 获取本年与下一年；有变化时更新并通知。网络失败静默，下个周期再试 */
  async refresh(): Promise<boolean> {
    const thisYear = new Date(this.now()).getFullYear();
    let changed = false;
    for (const year of [thisYear, thisYear + 1]) {
      const y = await this.download(year);
      if (!y) continue;
      mkdirSync(this.dir, { recursive: true });
      writeFileSync(join(this.dir, `${year}.json`), JSON.stringify(y));
      if (y.days.length && JSON.stringify(this.data.get(year)?.days) !== JSON.stringify(y.days)) {
        this.data.set(year, y);
        changed = true;
      }
    }
    this.settings.set('holidayCheckedAt', this.now());
    if (changed) {
      this.apply();
      this.onChange(this.all);
      console.info('[holidays] updated', this.all.map((y) => y.year).join(','));
    }
    return changed;
  }

  private async download(year: number): Promise<HolidayYear | null> {
    for (const url of SOURCES) {
      try {
        const res = await this.fetcher(url(year));
        if (!res.ok) continue;
        const y = parseHolidayYear(await res.json(), year);
        if (y) return y;
      } catch (e) {
        console.warn('[holidays] fetch failed', url(year), e instanceof Error ? e.message : e);
      }
    }
    return null;
  }
}
