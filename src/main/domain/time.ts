// 纯函数：日期与定时器计算（不依赖 Electron，便于单元测试）

/** 本地日期 'YYYY-MM-DD' */
export function localDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 距下一个本地零点的毫秒数（至少 1 秒，避免零点附近重复触发） */
export function msUntilNextMidnight(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return Math.max(1000, next.getTime() - now.getTime());
}

/** setTimeout 的上限（约 24.8 天），超过时分段等待 */
export const MAX_TIMER_MS = 2 ** 31 - 1;

export function clampDelay(ms: number): number {
  return Math.min(Math.max(0, ms), MAX_TIMER_MS);
}

/**
 * 定时器触发时判断是否发生了"时间跳跃"（休眠唤醒或系统时间被调整）。
 * 实际时间比预期晚超过阈值即视为跳跃，需要扫描错过的提醒并重建调度。
 */
export function detectTimeJump(expectedAt: number, actualAt: number, thresholdMs = 60_000): boolean {
  return Math.abs(actualAt - expectedAt) > thresholdMs;
}
