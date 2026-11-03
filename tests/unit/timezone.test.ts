import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { migrate } from '../../src/main/db/migrate';
import { readZone, zoneChanged } from '../../src/main/domain/timezone';
import { bus } from '../../src/main/events/bus';
import { Scheduler } from '../../src/main/services/scheduler';
import { TagService } from '../../src/main/services/tags';
import { TodoService } from '../../src/main/services/todos';

const original = process.env['TZ'];
afterEach(() => {
  if (original === undefined) delete process.env['TZ'];
  else process.env['TZ'] = original;
  bus.removeAllListeners();
});

describe('时区变化（FR-REC-08）', () => {
  it('Node 在 TZ 变化后立即使用新时区；检测到名称或偏移变化', () => {
    process.env['TZ'] = 'Asia/Shanghai';
    const a = readZone(new Date(Date.UTC(2026, 10, 3)));
    process.env['TZ'] = 'Asia/Tokyo';
    const b = readZone(new Date(Date.UTC(2026, 10, 3)));
    expect(a).toEqual({ id: 'Asia/Shanghai', offset: -480 });
    expect(b).toEqual({ id: 'Asia/Tokyo', offset: -540 });
    expect(zoneChanged(a, b)).toBe(true);
    expect(zoneChanged(a, { ...a })).toBe(false);
  });

  it('AC：切换时区后，"每天 9:00"提醒按新时区的 9:00 触发', () => {
    process.env['TZ'] = 'Asia/Shanghai';
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    migrate(db);
    const settings = {
      allDayTime: '08:30',
      snoozeMinutes: 10 as const,
      pausedUntil: null,
      weekStart: 1 as const,
      defaultReminder: 0 as const,
    };
    const at = () => new Date(Date.UTC(2026, 10, 3, 0, 0)); // 上海 8:00 / 东京 9:00
    const todos = new TodoService(db, new TagService(db), () => settings, at);
    const scheduler = new Scheduler(
      db,
      () => settings,
      { remind: () => {}, remindMissed: () => {} },
      () => at().getTime() - 3_600_000,
    );
    scheduler.start();
    const t = todos.create({ title: '晨会', dueDate: '2026-11-04', dueTime: '09:00' });
    todos.setRepeat(t.id, { freq: 'daily', interval: 1, end: { type: 'never' } });
    const fire = () => db.prepare('SELECT next_fire_at FROM reminders WHERE todo_id = ?').pluck().get(t.id) as number;
    expect(new Date(fire()).toISOString()).toBe('2026-11-04T01:00:00.000Z'); // 上海 9:00

    process.env['TZ'] = 'Asia/Tokyo';
    bus.emit('time.jumped', 'timezone');
    expect(new Date(fire()).toISOString()).toBe('2026-11-04T00:00:00.000Z'); // 东京 9:00
    scheduler.stop();
  });
});

describe('通知权限（FR-REM-09）', () => {
  it('解析 reg query 的 REG_DWORD 输出', async () => {
    const { parseRegDword } = await import('../../src/main/platform/notify-status');
    const out = ['', 'HKEY_CURRENT_USER/PushNotifications', '    ToastEnabled    REG_DWORD    0x0', '', ''].join(
      '\r\n',
    );
    expect(parseRegDword(out, 'ToastEnabled')).toBe(0);
    expect(parseRegDword(out.replace('0x0', '0x1'), 'ToastEnabled')).toBe(1);
    expect(parseRegDword(out, 'Enabled')).toBeNull();
    expect(parseRegDword('', 'ToastEnabled')).toBeNull();
  });
});
