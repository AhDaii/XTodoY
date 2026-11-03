import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Settings } from '../../src/shared/types';
import { migrate } from '../../src/main/db/migrate';
import { localDateTime } from '../../src/main/domain/reminders';
import { bus } from '../../src/main/events/bus';
import { Scheduler } from '../../src/main/services/scheduler';
import { TagService } from '../../src/main/services/tags';
import { TodoService } from '../../src/main/services/todos';

const MIN = 60_000;
let now = localDateTime('2026-11-02', '09:00');
let db: Database.Database;
let todos: TodoService;
let scheduler: Scheduler;
let settings: Pick<Settings, 'allDayTime' | 'snoozeMinutes' | 'pausedUntil' | 'weekStart' | 'defaultReminder'>;
const reminded: string[][] = [];
const missed: string[][] = [];

beforeEach(() => {
  vi.useFakeTimers();
  now = localDateTime('2026-11-02', '09:00');
  vi.setSystemTime(now);
  reminded.length = 0;
  missed.length = 0;
  bus.removeAllListeners();
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db);
  settings = { allDayTime: '08:30', snoozeMinutes: 10, pausedUntil: null, weekStart: 1, defaultReminder: 0 };
  todos = new TodoService(
    db,
    new TagService(db),
    () => settings,
    () => new Date(now),
  );
  scheduler = new Scheduler(
    db,
    () => settings,
    { remind: (ids) => reminded.push(ids), remindMissed: (ids) => missed.push(ids) },
    () => now,
  );
  scheduler.start();
});

afterEach(() => {
  scheduler.stop();
  vi.useRealTimers();
});

/** 推进时钟并触发到期的定时器 */
function advance(ms: number) {
  now += ms;
  vi.advanceTimersByTime(ms);
}

describe('Scheduler', () => {
  it('带时间的新事项自动加"准时"提醒，并在截止时间触发（FR-REM-02/06）', () => {
    const t = todos.create({ title: '周会', dueDate: '2026-11-02', dueTime: '10:00' });
    expect(t.reminders.map((r) => r.spec)).toEqual([{ kind: 'relative', offsetMinutes: 0 }]);
    expect(scheduler.nextWakeAt).toBe(localDateTime('2026-11-02', '10:00'));
    advance(59 * MIN);
    expect(reminded).toEqual([]);
    advance(1 * MIN);
    expect(reminded).toEqual([[t.id]]);
    expect(scheduler.nextWakeAt).toBeNull(); // 不重复提醒
  });

  it('全天事项按默认提醒时间；设置时已过去的提醒不补发', () => {
    const t = todos.create({ title: '交房租', dueDate: '2026-11-03' });
    todos.setReminders(t.id, [
      { kind: 'relative', offsetMinutes: 0 },
      { kind: 'relative', offsetMinutes: 1440 },
    ]);
    // "提前 1 天"= 11-02 08:30，设置时已经过去，不补发；下一次是当天 08:30
    expect(scheduler.nextWakeAt).toBe(localDateTime('2026-11-03', '08:30'));
    expect(reminded).toEqual([]);
  });

  it('完成事项后取消提醒，取消完成且时刻未过则恢复（FR-REM-08）', () => {
    const t = todos.create({ title: 'x', dueDate: '2026-11-02', dueTime: '10:00' });
    todos.toggle(t.id);
    expect(scheduler.nextWakeAt).toBeNull();
    todos.toggle(t.id);
    expect(scheduler.nextWakeAt).toBe(localDateTime('2026-11-02', '10:00'));
  });

  it('稍后提醒 10 分钟后再次提醒（FR-REM-05）', () => {
    const t = todos.create({ title: 'x', dueDate: '2026-11-02', dueTime: '09:30' });
    advance(30 * MIN);
    expect(reminded).toHaveLength(1);
    scheduler.snooze(t.id);
    advance(9 * MIN);
    expect(reminded).toHaveLength(1);
    advance(1 * MIN);
    expect(reminded).toHaveLength(2);
  });

  it('循环事项完成本次后按下一次实例重新提醒', () => {
    const t = todos.create({ title: '晨会', dueDate: '2026-11-02', dueTime: '09:30' });
    todos.setRepeat(t.id, { freq: 'daily', interval: 1, end: { type: 'never' } });
    todos.toggle(t.id);
    expect(todos.get(t.id).dueDate).toBe('2026-11-03');
    expect(scheduler.nextWakeAt).toBe(localDateTime('2026-11-03', '09:30'));
  });

  it('休眠唤醒后补发 24 小时内的提醒，超过 3 条合并（FR-REM-07）', () => {
    for (let i = 0; i < 4; i++) todos.create({ title: `t${i}`, dueDate: '2026-11-02', dueTime: `1${i}:00` });
    scheduler.stop(); // 模拟睡眠：定时器未运行
    now = localDateTime('2026-11-02', '18:00');
    bus.emit('time.jumped', 'resume');
    expect(reminded).toEqual([]);
    expect(missed).toHaveLength(1);
    expect(missed[0]).toHaveLength(4);
  });

  it('超过 24 小时的错过提醒不再补发', () => {
    todos.create({ title: 'old', dueDate: '2026-11-02', dueTime: '10:00' });
    scheduler.stop();
    now = localDateTime('2026-11-04', '12:00');
    bus.emit('time.jumped', 'resume');
    expect(reminded).toEqual([]);
    expect(missed).toEqual([]);
  });

  it('暂停期间不提醒，暂停结束后补发（FR-BG-06）', () => {
    todos.create({ title: 'x', dueDate: '2026-11-02', dueTime: '09:30' });
    settings.pausedUntil = localDateTime('2026-11-02', '10:00');
    bus.emit('settings.changed', { pausedUntil: settings.pausedUntil });
    advance(30 * MIN);
    expect(reminded).toEqual([]);
    advance(30 * MIN);
    expect(reminded).toHaveLength(1);
  });

  it('清除截止日期时移除相对提醒与循环', () => {
    const t = todos.create({ title: 'x', dueDate: '2026-11-02', dueTime: '10:00' });
    todos.setRepeat(t.id, { freq: 'daily', interval: 1, end: { type: 'never' } });
    const u = todos.update(t.id, { dueDate: null });
    expect(u.reminders).toEqual([]);
    expect(u.rrule).toBeNull();
    expect(scheduler.nextWakeAt).toBeNull();
  });
});
