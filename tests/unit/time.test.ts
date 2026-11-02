import { describe, expect, it } from 'vitest';
import { clampDelay, detectTimeJump, localDate, MAX_TIMER_MS, msUntilNextMidnight } from '../../src/main/domain/time';

describe('localDate', () => {
  it('按本地时区格式化为 YYYY-MM-DD', () => {
    expect(localDate(new Date(2026, 10, 2, 23, 59))).toBe('2026-11-02');
    expect(localDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('msUntilNextMidnight', () => {
  it('计算到下一个零点的时长', () => {
    expect(msUntilNextMidnight(new Date(2026, 10, 2, 23, 0, 0))).toBe(60 * 60 * 1000);
  });
  it('零点整时等待完整的一天', () => {
    expect(msUntilNextMidnight(new Date(2026, 10, 2, 0, 0, 0))).toBe(24 * 60 * 60 * 1000);
  });
  it('跨月', () => {
    expect(msUntilNextMidnight(new Date(2026, 10, 30, 23, 59, 30))).toBe(30 * 1000);
  });
});

describe('clampDelay', () => {
  it('不超过 setTimeout 上限，不小于 0', () => {
    expect(clampDelay(-5)).toBe(0);
    expect(clampDelay(10)).toBe(10);
    expect(clampDelay(MAX_TIMER_MS * 3)).toBe(MAX_TIMER_MS);
  });
});

describe('detectTimeJump', () => {
  it('正常误差内不算跳跃', () => {
    expect(detectTimeJump(1_000_000, 1_000_500)).toBe(false);
  });
  it('休眠 1 小时后唤醒视为跳跃', () => {
    expect(detectTimeJump(1_000_000, 1_000_000 + 3_600_000)).toBe(true);
  });
  it('系统时间被往回调也视为跳跃', () => {
    expect(detectTimeJump(1_000_000, 1_000_000 - 120_000)).toBe(true);
  });
});
