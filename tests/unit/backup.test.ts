import Database from 'better-sqlite3';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrate, MIGRATIONS } from '../../src/main/db/migrate';
import { BackupService } from '../../src/main/services/backup';
import { SettingsService } from '../../src/main/services/settings';
import { TagService } from '../../src/main/services/tags';
import { TodoService } from '../../src/main/services/todos';
import { DEFAULT_SETTINGS } from '../../src/shared/types';

let dir: string;
const open = () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db);
  const settings = new SettingsService(db);
  const tags = new TagService(db);
  const todos = new TodoService(db, tags, () => ({ ...DEFAULT_SETTINGS, defaultReminder: -1 }));
  const backup = new BackupService(db, dir, settings, MIGRATIONS.length);
  return { db, settings, tags, todos, backup };
};
const dump = (db: Database.Database) =>
  Object.fromEntries(
    ['todos', 'tags', 'todo_tags', 'reminders', 'completion_logs', 'settings'].map((t) => [
      t,
      db.prepare(`SELECT * FROM ${t} ORDER BY 1, 2`).all(),
    ]),
  );

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'xtodoy-backup-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('BackupService', () => {
  it('AC FR-SET-06：导出后导入到全新安装，数据完全一致', () => {
    const a = open();
    const work = a.tags.create({ name: '工作', parentId: null });
    const sub = a.tags.create({ name: '项目A', parentId: work.id });
    const t = a.todos.create({ title: '周报', dueDate: '2026-11-04', dueTime: '09:00', tagIds: [sub.id] });
    a.todos.setReminders(t.id, [{ kind: 'relative', offsetMinutes: 15 }]);
    a.todos.setRepeat(t.id, { freq: 'weekly', interval: 1, byDay: [3], end: { type: 'never' } });
    a.todos.toggle(a.todos.create({ title: '已完成' }).id);
    a.settings.set('theme', 'dark');
    a.settings.set('weekStart', 0);

    const file = JSON.parse(JSON.stringify(a.backup.exportData()));
    expect(file).toMatchObject({ app: 'XTodoY', schemaVersion: MIGRATIONS.length });

    const b = open();
    b.todos.create({ title: '会被覆盖' });
    expect(b.backup.importData(file)).toEqual({ todos: 2, tags: 2, completionLogs: 1 });
    expect(dump(b.db)).toEqual(dump(a.db));
    expect(b.settings.get()).toMatchObject({ theme: 'dark', weekStart: 0 });
    // 覆盖前自动备份
    expect(readdirSync(join(dir, 'backups')).some((f) => f.startsWith('pre-import-'))).toBe(true);
  });

  it('支持更早的 schemaVersion（缺少新列时使用默认值）', () => {
    const a = open();
    a.todos.create({ title: '旧版本数据' });
    const file = a.backup.exportData();
    file.schemaVersion = 1;
    for (const r of file.todos) delete r['repeat_anchor'];
    const b = open();
    b.backup.importData(file);
    expect(b.todos.list({ view: 'all' }).flatMap((g) => g.items.map((x) => x.title))).toEqual(['旧版本数据']);
  });

  it('文件不合法时拒绝导入，当前数据不变', () => {
    const a = open();
    a.todos.create({ title: '保留' });
    const before = dump(a.db);
    expect(() => a.backup.importData({ app: 'Other' })).toThrow('不是 XTodoY 备份文件');
    expect(() => a.backup.importData({ ...a.backup.exportData(), schemaVersion: 999 })).toThrow('更新版本');
    const broken = a.backup.exportData();
    broken.todos.push({ id: 'x', title: '', sort_key: 'a', created_at: 0, updated_at: 0 }); // 违反 CHECK
    expect(() => a.backup.importData(broken)).toThrow('当前数据未做改动');
    const orphan = a.backup.exportData();
    orphan.todoTags.push({ todo_id: 'nope', tag_id: 'nope' }); // 违反外键
    expect(() => a.backup.importData(orphan)).toThrow();
    expect(dump(a.db)).toEqual(before);
  });

  it('每日备份每天只做一次，保留最近 7 份', () => {
    const { backup } = open();
    const bdir = join(dir, 'backups');
    expect(backup.daily(new Date(2026, 10, 4, 9))).not.toBeNull();
    expect(backup.daily(new Date(2026, 10, 4, 18))).toBeNull();
    expect(backup.lastBackupDate()).toBe('2026-11-04');
    for (let i = 0; i < 9; i++) writeFileSync(join(bdir, `daily-2020-01-0${i}T00-00-00-000Z.db`), '');
    expect(backup.daily(new Date(2026, 10, 5, 9))).not.toBeNull();
    const daily = readdirSync(bdir).filter((f) => f.startsWith('daily-'));
    expect(daily).toHaveLength(7);
    expect(daily.some((f) => f.startsWith('daily-2026'))).toBe(true);
  });
});
