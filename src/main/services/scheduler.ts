import type { ReminderSpec, Settings } from '@shared/types';
import type { DB } from '../db/client';
import { fireTime, planDelivery, type DueReminder } from '../domain/reminders';
import { clampDelay } from '../domain/time';
import { bus } from '../events/bus';

interface Row {
  id: string;
  todo_id: string;
  kind: 'relative' | 'absolute';
  offset_minutes: number | null;
  fire_at_abs: number | null;
  next_fire_at: number | null;
  fired_at: number | null;
  snoozed_until: number | null;
  due_date: string | null;
  due_time: string | null;
  status: 'open' | 'done';
  deleted_at: number | null;
}

export interface SchedulerOutput {
  /** 逐条提醒（每个事项一条通知） */
  remind(todoIds: string[]): void;
  /** 合并提醒："你错过了 N 个提醒"（D-4） */
  remindMissed(todoIds: string[]): void;
}

type SchedulerSettings = Pick<Settings, 'allDayTime' | 'snoozeMinutes' | 'pausedUntil'>;

/**
 * 提醒调度（architecture.md §3.1，FR-REM-05~08）：
 * - 每条提醒在库中保存 next_fire_at（下一次触发时刻），由事项日期、时间、循环实例与稍后提醒推算；
 * - 全局只挂一个定时器，睡到最近的 next_fire_at，没有轮询；
 * - 启动、唤醒、时间跳跃、暂停结束时统一走 deliverDue：24 小时内的补发，> 3 条合并，更早的静默。
 */
export class Scheduler {
  private timer: NodeJS.Timeout | null = null;
  private armedFor: number | null = null;

  constructor(
    private readonly db: DB,
    private readonly settings: () => SchedulerSettings,
    private readonly out: SchedulerOutput,
    private readonly now: () => number = () => Date.now(),
  ) {}

  start(): void {
    bus.on('todos.changed', (ids) => {
      this.recompute(ids);
      this.arm();
    });
    bus.on('settings.changed', (patch) => {
      if (patch.allDayTime !== undefined) this.recompute();
      if ('pausedUntil' in patch && patch.pausedUntil === null) this.deliverDue();
      this.arm();
    });
    bus.on('time.jumped', () => {
      this.recompute();
      this.deliverDue();
      this.arm();
    });
    this.recompute();
    this.deliverDue();
    this.arm();
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** 下一次定时器将要触发的时刻（测试与诊断用） */
  get nextWakeAt(): number | null {
    return this.armedFor;
  }

  private rows(ids?: string[]): Row[] {
    return this.db
      .prepare(
        `SELECT r.*, t.due_date, t.due_time, t.status, t.deleted_at FROM reminders r JOIN todos t ON t.id = r.todo_id
         ${ids ? 'WHERE r.todo_id IN (SELECT value FROM json_each(?))' : ''}`,
      )
      .all(...(ids ? [JSON.stringify(ids)] : [])) as Row[];
  }

  /** 重新推算 next_fire_at：已触发过的实例不重复；新实例清除稍后提醒；完成 / 删除的事项不提醒（FR-REM-08） */
  recompute(ids?: string[]): void {
    const { allDayTime } = this.settings();
    const now = this.now();
    const upd = this.db.prepare('UPDATE reminders SET next_fire_at = ?, snoozed_until = ?, fired_at = ? WHERE id = ?');
    const tx = this.db.transaction(() => {
      for (const r of this.rows(ids)) {
        const spec: ReminderSpec =
          r.kind === 'absolute'
            ? { kind: 'absolute', at: r.fire_at_abs! }
            : { kind: 'relative', offsetMinutes: r.offset_minutes! };
        const fire =
          r.status === 'open' && r.deleted_at === null ? fireTime(spec, r.due_date, r.due_time, allDayTime) : null;
        let next: number | null;
        let snoozed = r.snoozed_until;
        let fired = r.fired_at;
        if (fire === null) {
          next = null;
          snoozed = null;
        } else if (fire === r.fired_at) {
          next = snoozed; // 本次已提醒过；若被稍后提醒，则在稍后时刻再提醒
        } else if (fire < now - 1000 && fire !== r.next_fire_at) {
          // 新设置（或改期后）就已经过去的提醒不补发：只有原本排好、因休眠等错过的才补发
          next = null;
          snoozed = null;
          fired = fire;
        } else {
          next = fire;
          snoozed = null;
        }
        if (next !== r.next_fire_at || snoozed !== r.snoozed_until || fired !== r.fired_at) {
          upd.run(next, snoozed, fired, r.id);
        }
      }
    });
    tx();
  }

  /** 发出所有已到期的提醒 */
  deliverDue(): void {
    const now = this.now();
    const paused = this.settings().pausedUntil;
    if (paused && paused > now) return;
    const due = this.db
      .prepare(
        `SELECT id, todo_id AS todoId, next_fire_at AS fireAt FROM reminders
         WHERE next_fire_at IS NOT NULL AND next_fire_at <= ? ORDER BY next_fire_at`,
      )
      .all(now + 500) as DueReminder[];
    if (!due.length) return;
    const plan = planDelivery(due, now);
    // 标记为已触发：fired_at 记录本次实例的计划时刻（稍后提醒的保持原值）
    const mark = this.db.prepare(
      `UPDATE reminders SET fired_at = CASE WHEN snoozed_until IS NULL THEN next_fire_at ELSE fired_at END,
       next_fire_at = NULL, snoozed_until = NULL WHERE id = ?`,
    );
    this.db.transaction(() => due.forEach((r) => mark.run(r.id)))();
    if (plan.notify.length) this.out.remind(plan.notify.map((r) => r.todoId));
    if (plan.merged.length) this.out.remindMissed(plan.merged.map((r) => r.todoId));
  }

  /** 稍后提醒（FR-REM-05）：最近一次触发的那条提醒在 N 分钟后再次提醒 */
  snooze(todoId: string, minutes = this.settings().snoozeMinutes): number {
    const row = this.db
      .prepare('SELECT id FROM reminders WHERE todo_id = ? AND fired_at IS NOT NULL ORDER BY fired_at DESC LIMIT 1')
      .get(todoId) as { id: string } | undefined;
    const at = this.now() + minutes * 60_000;
    if (row) {
      this.db.prepare('UPDATE reminders SET snoozed_until = ?, next_fire_at = ? WHERE id = ?').run(at, at, row.id);
    } else {
      // 没有可稍后的提醒（例如测试通知）：临时加一条绝对提醒
      this.db
        .prepare(
          "INSERT INTO reminders (id, todo_id, kind, fire_at_abs, next_fire_at) VALUES (lower(hex(randomblob(16))), ?, 'absolute', ?, ?)",
        )
        .run(todoId, at, at);
    }
    this.arm();
    return at;
  }

  /** 只挂一个定时器到最近的触发时刻；暂停期间睡到暂停结束 */
  arm(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.armedFor = null;
    const next = this.db.prepare('SELECT MIN(next_fire_at) FROM reminders').pluck().get() as number | null;
    const paused = this.settings().pausedUntil;
    const now = this.now();
    let wake: number | null = next;
    if (paused && paused > now) wake = next === null ? paused : Math.max(next, paused);
    if (wake === null) return;
    this.armedFor = wake;
    this.timer = setTimeout(() => this.onTimer(), clampDelay(wake - now));
    this.timer.unref?.();
  }

  private onTimer(): void {
    this.timer = null;
    const paused = this.settings().pausedUntil;
    if (paused && paused <= this.now()) bus.emit('reminders.resumed');
    this.deliverDue();
    this.arm();
  }
}
