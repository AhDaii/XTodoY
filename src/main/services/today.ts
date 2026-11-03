import type { TodayCount } from '@shared/ipc';
import type { DB } from '../db/client';
import { bus } from '../events/bus';
import { localDate, msUntilNextMidnight } from '../domain/time';

/**
 * 今日计数（D-1：仅今天到期，不含逾期与无日期）。
 * 数据变更与跨零点时重新计算，并通过事件推送给悬浮窗、托盘与主窗口。
 */
export class TodayService {
  private midnightTimer: NodeJS.Timeout | null = null;
  private last: TodayCount = { open: 0, done: 0, total: 0 };

  constructor(private readonly db: DB) {}

  start(): void {
    bus.on('todos.changed', () => this.refresh());
    this.refresh();
    this.armMidnight();
  }

  stop(): void {
    if (this.midnightTimer) clearTimeout(this.midnightTimer);
  }

  get current(): TodayCount {
    return this.last;
  }

  refresh(): TodayCount {
    const row = this.db
      .prepare(
        `SELECT
           SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open,
           SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done,
           COUNT(*) AS total
         FROM todos WHERE deleted_at IS NULL AND due_date = ?`,
      )
      .get(localDate(new Date())) as { open: number | null; done: number | null; total: number };
    const next = { open: row.open ?? 0, done: row.done ?? 0, total: row.total };
    if (next.open !== this.last.open || next.done !== this.last.done || next.total !== this.last.total) {
      this.last = next;
      bus.emit('today.count', next);
    }
    return next;
  }

  /** 唤醒或时钟变化后调用：重新计算并重挂零点定时器 */
  resync(): void {
    this.refresh();
    this.armMidnight();
  }

  private armMidnight(): void {
    if (this.midnightTimer) clearTimeout(this.midnightTimer);
    this.midnightTimer = setTimeout(() => this.resync(), msUntilNextMidnight(new Date()));
  }
}
