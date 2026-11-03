import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readHardwareAcceleration } from '../../src/main/app/launch-prefs';
import { migrate } from '../../src/main/db/migrate';
import { SettingsService } from '../../src/main/services/settings';

let dir: string;
beforeEach(() => (dir = mkdtempSync(join(tmpdir(), 'xtodoy-prefs-'))));
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function withDb(fn: (db: Database.Database) => void) {
  const db = new Database(join(dir, 'xtodoy.db'));
  migrate(db);
  fn(db);
  db.close();
}

describe('readHardwareAcceleration（启动前读取）', () => {
  it('首次运行（没有数据库）默认关闭', () => {
    expect(readHardwareAcceleration(dir)).toBe(false);
  });
  it('读取设置服务保存的值', () => {
    withDb((db) => new SettingsService(db).set('hardwareAcceleration', true));
    expect(readHardwareAcceleration(dir)).toBe(true);
    withDb((db) => new SettingsService(db).set('hardwareAcceleration', false));
    expect(readHardwareAcceleration(dir)).toBe(false);
  });
  it('值损坏时回到默认值', () => {
    withDb((db) => db.prepare("INSERT INTO settings (key, value) VALUES ('hardwareAcceleration', 'not json')").run());
    expect(readHardwareAcceleration(dir)).toBe(false);
  });
});
