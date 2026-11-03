import { describe, expect, it } from 'vitest';
import {
  advanceAfterComplete,
  fromRRule,
  nextOccurrence,
  previewOccurrences,
  repeatSummary,
  toRRule,
  validateRule,
  type RepeatRule,
} from '../../src/shared/recurrence';

const never = { type: 'never' } as const;

describe('RRULE 序列化', () => {
  const cases: RepeatRule[] = [
    { freq: 'daily', interval: 2, end: never },
    { freq: 'weekdays', interval: 1, end: never },
    { freq: 'weekly', interval: 1, byDay: [1, 3, 5], end: { type: 'count', count: 10 } },
    { freq: 'monthly', interval: 1, monthDay: -1, end: { type: 'until', date: '2026-12-31' } },
    { freq: 'yearly', interval: 1, end: never },
  ];
  it.each(cases)('往返一致：%o', (r) => expect(fromRRule(toRRule(r))).toEqual(r));
  it('生成标准 RRULE', () => {
    expect(toRRule(cases[2]!)).toBe('FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE,FR;COUNT=10');
  });
});

describe('nextOccurrence', () => {
  it('每 2 天', () => {
    const r: RepeatRule = { freq: 'daily', interval: 2, end: never };
    expect(previewOccurrences(r, '2026-11-02', '2026-11-02', 3)).toEqual(['2026-11-02', '2026-11-04', '2026-11-06']);
  });
  it('工作日跳过周末', () => {
    const r: RepeatRule = { freq: 'weekdays', interval: 1, end: never };
    expect(nextOccurrence(r, '2026-11-02', '2026-11-06')).toBe('2026-11-09'); // 周五 → 下周一
  });
  it('每周一三五', () => {
    const r: RepeatRule = { freq: 'weekly', interval: 1, byDay: [1, 3, 5], end: never };
    expect(previewOccurrences(r, '2026-11-02', '2026-11-02', 4)).toEqual([
      '2026-11-02',
      '2026-11-04',
      '2026-11-06',
      '2026-11-09',
    ]);
  });
  it('每 2 周的周一', () => {
    const r: RepeatRule = { freq: 'weekly', interval: 2, byDay: [1], end: never };
    expect(previewOccurrences(r, '2026-11-02', '2026-11-02', 3)).toEqual(['2026-11-02', '2026-11-16', '2026-11-30']);
  });
  it('每月 31 日：小月落在最后一天（FR-REC-04）', () => {
    const r: RepeatRule = { freq: 'monthly', interval: 1, monthDay: 31, end: never };
    expect(previewOccurrences(r, '2027-01-31', '2027-01-31', 4)).toEqual([
      '2027-01-31',
      '2027-02-28',
      '2027-03-31',
      '2027-04-30',
    ]);
  });
  it('每月最后一天，闰年 2 月', () => {
    const r: RepeatRule = { freq: 'monthly', interval: 1, monthDay: -1, end: never };
    expect(nextOccurrence(r, '2028-01-31', '2028-01-31')).toBe('2028-02-29');
  });
  it('每年 2 月 29 日在非闰年落在 2 月 28 日', () => {
    const r: RepeatRule = { freq: 'yearly', interval: 1, end: never };
    expect(nextOccurrence(r, '2028-02-29', '2028-02-29')).toBe('2029-02-28');
  });
  it('结束日期与次数', () => {
    const until: RepeatRule = { freq: 'daily', interval: 1, end: { type: 'until', date: '2026-11-03' } };
    expect(nextOccurrence(until, '2026-11-02', '2026-11-03')).toBeNull();
    const count: RepeatRule = { freq: 'daily', interval: 1, end: { type: 'count', count: 3 } };
    expect(nextOccurrence(count, '2026-11-02', '2026-11-03', 2)).toBe('2026-11-04');
    expect(nextOccurrence(count, '2026-11-02', '2026-11-04', 3)).toBeNull();
  });
});

describe('完成后前进（FR-REC-05）', () => {
  const weeklyMon: RepeatRule = { freq: 'weekly', interval: 1, byDay: [1], end: never };
  it('周三完成周一的实例，下一次为下周一', () => {
    expect(advanceAfterComplete(weeklyMon, '2026-11-02', '2026-11-02', '2026-11-04', 1)).toBe('2026-11-09');
  });
  it('逾期 3 周的每周事项完成后跳到不早于今天的实例', () => {
    expect(advanceAfterComplete(weeklyMon, '2026-10-12', '2026-10-12', '2026-11-04', 1)).toBe('2026-11-09');
    expect(advanceAfterComplete(weeklyMon, '2026-10-12', '2026-10-12', '2026-11-02', 1)).toBe('2026-11-02');
  });
  it('达到次数后不再有下一次', () => {
    const r: RepeatRule = { freq: 'daily', interval: 1, end: { type: 'count', count: 2 } };
    expect(advanceAfterComplete(r, '2026-11-02', '2026-11-03', '2026-11-03', 2)).toBeNull();
  });
});

describe('校验与摘要', () => {
  it('拒绝不合法的规则', () => {
    expect(validateRule({ freq: 'daily', interval: 0, end: never })).toMatch(/间隔/);
    expect(validateRule({ freq: 'monthly', interval: 1, monthDay: 32, end: never })).toMatch(/每月/);
    expect(validateRule({ freq: 'daily', interval: 1, end: { type: 'count', count: 0 } })).toMatch(/次数/);
  });
  it('摘要文字', () => {
    expect(repeatSummary({ freq: 'weekly', interval: 1, byDay: [5, 1, 3], end: never })).toBe('每周 周一、周三、周五');
    expect(repeatSummary({ freq: 'monthly', interval: 2, monthDay: -1, end: { type: 'count', count: 6 } })).toBe(
      '每 2 月 最后一天，共 6 次',
    );
    expect(repeatSummary(null)).toBe('不重复');
  });
});
