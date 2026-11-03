import Database from 'better-sqlite3';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DbCorruptError, DbMigrationError, openDatabase } from '../../src/main/db/client';
import { migrate, MIGRATIONS } from '../../src/main/db/migrate';
import { latestBackup, restoreFromBackup } from '../../src/main/db/recovery';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'xtodoy-recovery-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const file = () => join(dir, 'xtodoy.db');

describe('打开数据库（NFR-REL-02 / 03）', () => {
  it('文件不是数据库时报告损坏', () => {
    writeFileSync(file(), 'this is not a sqlite database'.repeat(200));
    expect(() => openDatabase(dir)).toThrow(DbCorruptError);
  });

  it('迁移失败时回滚并报告，原数据保持不变', () => {
    const db = new Database(file());
    migrate(db, MIGRATIONS.slice(0, 1));
    db.prepare(
      "INSERT INTO todos (id, title, sort_key, created_at, updated_at) VALUES ('t1', '保留的待办', 'a0', 0, 0)",
    ).run();
    // 让第 2 个迁移（新增 repeat_anchor 列）必然失败
    db.exec('ALTER TABLE todos ADD COLUMN repeat_anchor TEXT');
    db.close();

    const err = (() => {
      try {
        openDatabase(dir);
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(DbMigrationError);
    expect(err).toMatchObject({ from: 1, to: MIGRATIONS.length, message: '数据库升级失败' });

    const check = new Database(file(), { readonly: true });
    expect(check.pragma('user_version', { simple: true })).toBe(1);
    expect(check.prepare('SELECT title FROM todos').pluck().get()).toBe('保留的待办');
    check.close();
    // 迁移前已做备份
    expect(readdirSync(join(dir, 'backups')).some((f) => f.startsWith('pre-migrate-'))).toBe(true);
  });

  it('数据来自更新版本时拒绝打开（不降级）', () => {
    const db = new Database(file());
    db.pragma(`user_version = ${MIGRATIONS.length + 1}`);
    db.close();
    expect(() => openDatabase(dir)).toThrow('数据库版本高于程序版本');
  });
});

describe('从备份恢复', () => {
  it('选择最新的非空备份；恢复后原文件移到 corrupt/ 保留', () => {
    expect(latestBackup(dir)).toBeNull();
    const backups = join(dir, 'backups');
    mkdirSync(backups);
    const good = openDatabase(dir);
    good.db.prepare("INSERT INTO settings (key, value) VALUES ('theme', '\"dark\"')").run();
    good.db.exec(`VACUUM INTO '${join(backups, 'daily-new.db').replace(/'/g, "''")}'`);
    good.db.close();
    writeFileSync(join(backups, 'daily-old.db'), 'x');
    writeFileSync(join(backups, 'daily-empty.db'), '');
    utimesSync(join(backups, 'daily-old.db'), new Date(2020, 0, 1), new Date(2020, 0, 1));
    expect(latestBackup(dir)?.file).toBe(join(backups, 'daily-new.db'));

    writeFileSync(file(), 'garbage'.repeat(500));
    const aside = restoreFromBackup(dir, join(backups, 'daily-new.db'), new Date(2026, 10, 3));
    expect(existsSync(aside)).toBe(true);
    const { db } = openDatabase(dir);
    expect(db.prepare("SELECT value FROM settings WHERE key = 'theme'").pluck().get()).toBe('"dark"');
    db.close();
  });
});
