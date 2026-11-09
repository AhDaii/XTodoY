import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import bundled from '../../src/main/data/holidays.json';
import { HolidayService, type Fetcher } from '../../src/main/services/holidays';
import { fromRRule, nextOccurrence, previewOccurrences, toRRule } from '../../src/shared/recurrence';
import { DEFAULT_SETTINGS, type Settings } from '../../src/shared/types';
import {
  holidayName,
  isFirstWorkday,
  isWorkday,
  parseHolidayYear,
  setHolidayData,
  type HolidayYear,
} from '../../src/shared/workdays';

beforeEach(() => setHolidayData(bundled as HolidayYear[]));
afterEach(() => setHolidayData([]));

describe('工作日日历（holiday-cn 2026）', () => {
  it('法定假日休息、调休日上班，其余按周一至周五', () => {
    expect(isWorkday('2026-10-01')).toBe(false); // 国庆（周四）
    expect(isWorkday('2026-10-10')).toBe(true); // 调休上班（周六）
    expect(isWorkday('2026-09-20')).toBe(true); // 调休上班（周日）
    expect(isWorkday('2026-11-04')).toBe(true); // 普通周三
    expect(isWorkday('2026-11-07')).toBe(false); // 普通周六
    expect(holidayName('2026-10-10')).toEqual({ name: '国庆节', offDay: false });
  });

  it('没有该年数据时按周一至周五', () => {
    expect(isWorkday('2030-10-01')).toBe(true); // 周二
    expect(isWorkday('2030-10-05')).toBe(false); // 周六
  });

  it('休息后的第一个工作日', () => {
    expect(isFirstWorkday('2026-09-28')).toBe(true); // 中秋连休（9/25–27）之后的周一
    expect(isFirstWorkday('2026-09-29')).toBe(false);
    expect(isFirstWorkday('2026-10-08')).toBe(true); // 国庆假期后（周四）
    expect(isFirstWorkday('2026-10-10')).toBe(false); // 调休周六：前一天周五已上班
    expect(isFirstWorkday('2026-09-20')).toBe(true); // 调休周日：前一天周六休息
    expect(isFirstWorkday('2026-11-09')).toBe(true); // 普通周一
    expect(isFirstWorkday('2026-11-08')).toBe(false); // 周日本身休息
  });

  it('校验下载的数据：只接受 holiday-cn 格式与对应年份', () => {
    const ok = { year: 2027, days: [{ name: '元旦', date: '2027-01-01', isOffDay: true }] };
    expect(parseHolidayYear(ok, 2027)).toEqual(ok);
    expect(parseHolidayYear(ok, 2028)).toBeNull();
    expect(
      parseHolidayYear({ year: 2027, days: [{ name: '元旦', date: '2027/1/1', isOffDay: true }] }, 2027),
    ).toBeNull();
    expect(parseHolidayYear({ year: 2027, days: 'x' }, 2027)).toBeNull();
    expect(parseHolidayYear(null, 2027)).toBeNull();
  });
});

describe('循环：每个工作日 / 工作日第一天', () => {
  it('每个工作日跳过国庆假期，包含调休上班日', () => {
    const r = fromRRule('FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR');
    expect(r.freq).toBe('weekdays');
    expect(nextOccurrence(r, '2026-09-01', '2026-09-30')).toBe('2026-10-08');
    expect(previewOccurrences(r, '2026-09-01', '2026-10-08', 4)).toEqual([
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
      '2026-10-12',
    ]);
  });

  it('工作日第一天：序列化往返，按休息后的第一个工作日生成实例', () => {
    const r = { freq: 'firstWorkday' as const, interval: 1, end: { type: 'never' as const } };
    expect(toRRule(r)).toBe('FREQ=DAILY;INTERVAL=1;X-WORKDAY=FIRST');
    expect(fromRRule(toRRule(r))).toEqual(r);
    expect(previewOccurrences(r, '2026-09-14', '2026-09-14', 5)).toEqual([
      '2026-09-14',
      '2026-09-20',
      '2026-09-28',
      '2026-10-08',
      '2026-10-12',
    ]);
  });
});

describe('HolidayService', () => {
  let dir: string;
  let settings: Settings;
  const store = {
    get: () => settings,
    set: <K extends keyof Settings>(k: K, v: Settings[K]) => {
      settings = { ...settings, [k]: v };
    },
  };
  const now = () => new Date(2026, 10, 20).getTime();

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'xtodoy-holidays-'));
    settings = structuredClone(DEFAULT_SETTINGS);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const respond =
    (byYear: Record<number, unknown>): Fetcher =>
    async (url) => {
      const y = Number(/(\d{4})\.json$/.exec(url)?.[1]);
      return { ok: y in byYear, json: async () => byYear[y] };
    };

  it('联网获取下一年的安排并缓存；有变化时通知，重启后从缓存加载', async () => {
    const y2027 = { year: 2027, days: [{ name: '元旦', date: '2027-01-01', isOffDay: true }] };
    const onChange = vi.fn();
    const svc = new HolidayService(dir, store, onChange, respond({ 2026: bundled[2], 2027: y2027 }), now);
    expect(await svc.refresh()).toEqual({ ok: true, changed: true });
    expect(onChange).toHaveBeenCalledOnce();
    expect(isWorkday('2027-01-01')).toBe(false);
    expect(settings.holidayCheckedAt).toBe(now());
    expect(JSON.parse(readFileSync(join(dir, '2027.json'), 'utf8'))).toEqual(y2027);

    setHolidayData([]);
    const again = new HolidayService(dir, store, vi.fn(), respond({}), now);
    expect(again.all.map((y) => y.year)).toContain(2027);
    expect(isWorkday('2027-01-01')).toBe(false);
  });

  it('网络失败、数据不合法或尚未公布（空文件）时不改动现有数据', async () => {
    const onChange = vi.fn();
    const failing: Fetcher = async () => {
      throw new Error('getaddrinfo ENOTFOUND');
    };
    const svc = new HolidayService(dir, store, onChange, failing, now);
    expect(await svc.refresh()).toEqual({ ok: false, changed: false });
    // 失败时不记录"更新于"的时间（#42）
    expect(settings.holidayCheckedAt).toBeNull();
    const bad = new HolidayService(
      dir,
      store,
      onChange,
      respond({ 2026: { year: 2026, days: 'x' }, 2027: { year: 2027, days: [] } }),
      now,
    );
    // 2027 年为空文件（尚未公布）也算获取成功，但数据没有变化
    expect(await bad.refresh()).toEqual({ ok: true, changed: false });
    expect(onChange).not.toHaveBeenCalled();
    expect(isWorkday('2026-10-01')).toBe(false); // 内置数据仍然有效
  });

  it('损坏的缓存文件被忽略', () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, '2026.json'), '{ not json');
    const svc = new HolidayService(dir, store, vi.fn(), respond({}), now);
    expect(svc.all.find((y) => y.year === 2026)?.days.length).toBeGreaterThan(30);
  });
});
