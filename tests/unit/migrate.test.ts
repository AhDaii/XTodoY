import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { migrate } from '../../src/main/db/migrate';

// 测试环境不经过 Vite，直接读 SQL 文件
const init = readFileSync(new URL('../../migrations/0001_init.sql', import.meta.url), 'utf8');

function fresh() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  return db;
}

describe('migrate', () => {
  it('新库执行全部迁移并写入 user_version', () => {
    const db = fresh();
    expect(migrate(db, [init])).toEqual({ from: 0, to: 1 });
    expect(db.pragma('user_version', { simple: true })).toBe(1);
    const tables = db.prepare("select name from sqlite_master where type='table' order by name").pluck().all();
    expect(tables).toEqual(['completion_logs', 'meta', 'reminders', 'settings', 'tags', 'todo_tags', 'todos']);
  });

  it('已是最新时不重复执行', () => {
    const db = fresh();
    migrate(db, [init]);
    expect(migrate(db, [init])).toEqual({ from: 1, to: 1 });
  });

  it('迁移失败时整体回滚', () => {
    const db = fresh();
    migrate(db, [init]);
    expect(() => migrate(db, [init, 'CREATE TABLE ok_table (x); THIS IS NOT SQL;'])).toThrow();
    expect(db.pragma('user_version', { simple: true })).toBe(1);
    const t = db.prepare("select count(*) from sqlite_master where name='ok_table'").pluck().get();
    expect(t).toBe(0);
  });

  it('拒绝降级', () => {
    const db = fresh();
    db.pragma('user_version = 5');
    expect(() => migrate(db, [init])).toThrow(/降级/);
  });

  it('同级标签名不区分大小写唯一，深度不超过 5 级', () => {
    const db = fresh();
    migrate(db, [init]);
    const ins = db.prepare(
      'insert into tags (id, parent_id, name, color, sort_key, path, depth) values (?,?,?,?,?,?,?)',
    );
    ins.run('a', null, 'Work', 'teal', 'a', '/a/', 0);
    expect(() => ins.run('b', null, 'work', 'teal', 'b', '/b/', 0)).toThrow();
    expect(() => ins.run('c', 'a', 'deep', 'teal', 'c', '/a/c/', 5)).toThrow();
  });
});
