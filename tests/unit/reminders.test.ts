import { describe, expect, it } from 'vitest';
import { fireTime, localDateTime, planDelivery } from '../../src/main/domain/reminders';
import { reminderLabel } from '../../src/shared/reminders';

const H = 3_600_000;

describe('fireTime', () => {
  it('相对提醒以截止时间为基准', () => {
    expect(fireTime({ kind: 'relative', offsetMinutes: 15 }, '2026-11-02', '10:00', '08:30')).toBe(
      localDateTime('2026-11-02', '09:45'),
    );
  });
  it('全天事项以默认提醒时间为基准；提前 1 天为前一天该时间', () => {
    expect(fireTime({ kind: 'relative', offsetMinutes: 0 }, '2026-11-02', null, '08:30')).toBe(
      localDateTime('2026-11-02', '08:30'),
    );
    expect(fireTime({ kind: 'relative', offsetMinutes: 1440 }, '2026-11-02', null, '08:30')).toBe(
      localDateTime('2026-11-01', '08:30'),
    );
  });
  it('无截止日期时相对提醒无效，绝对提醒不受影响', () => {
    expect(fireTime({ kind: 'relative', offsetMinutes: 0 }, null, null, '08:30')).toBeNull();
    expect(fireTime({ kind: 'absolute', at: 123 }, null, null, '08:30')).toBe(123);
  });
});

describe('planDelivery（D-4）', () => {
  const now = localDateTime('2026-11-02', '12:00');
  const r = (id: string, todoId: string, hoursAgo: number) => ({ id, todoId, fireAt: now - hoursAgo * H });
  it('24 小时内的逐条通知，更早的静默', () => {
    const p = planDelivery([r('a', 't1', 1), r('b', 't2', 30)], now);
    expect(p.notify.map((x) => x.id)).toEqual(['a']);
    expect(p.silent.map((x) => x.id)).toEqual(['b']);
  });
  it('超过 3 条时合并为一条', () => {
    const p = planDelivery([r('a', 't1', 1), r('b', 't2', 2), r('c', 't3', 3), r('d', 't4', 4)], now);
    expect(p.notify).toEqual([]);
    expect(p.merged).toHaveLength(4);
  });
  it('同一事项多条提醒同时到期只通知一次', () => {
    const p = planDelivery([r('a', 't1', 1), r('b', 't1', 2)], now);
    expect(p.notify).toHaveLength(1);
    expect(p.silent).toHaveLength(1);
  });
});

describe('reminderLabel', () => {
  it('各种偏移的文字', () => {
    expect(reminderLabel({ kind: 'relative', offsetMinutes: 0 }, false, '08:30')).toBe('准时');
    expect(reminderLabel({ kind: 'relative', offsetMinutes: 15 }, false, '08:30')).toBe('提前 15 分钟');
    expect(reminderLabel({ kind: 'relative', offsetMinutes: 120 }, false, '08:30')).toBe('提前 2 小时');
    expect(reminderLabel({ kind: 'relative', offsetMinutes: 0 }, true, '08:30')).toBe('当天 08:30');
    expect(reminderLabel({ kind: 'relative', offsetMinutes: 1440 }, true, '08:30')).toBe('提前 1 天 08:30');
  });
});
