import type { Database } from 'better-sqlite3';
import init from '../../../migrations/0001_init.sql?raw';
import repeatAnchor from '../../../migrations/0002_repeat_anchor.sql?raw';

/** 迁移按序号排列；只允许向前（docs/design/database.md §3） */
export const MIGRATIONS: readonly string[] = [init, repeatAnchor];

export interface MigrateResult {
  from: number;
  to: number;
}

/**
 * 在一个事务内执行所有待执行的迁移并更新 user_version。
 * 失败时事务回滚，数据库保持迁移前状态；调用方负责在迁移前做文件备份。
 */
export function migrate(db: Database, migrations: readonly string[] = MIGRATIONS): MigrateResult {
  const from = db.pragma('user_version', { simple: true }) as number;
  const to = migrations.length;
  if (from > to) throw new Error(`数据库版本 ${from} 高于程序支持的 ${to}，不支持降级`);
  if (from === to) return { from, to };
  const run = db.transaction(() => {
    for (let v = from; v < to; v++) db.exec(migrations[v]!);
    db.pragma(`user_version = ${to}`);
  });
  run();
  return { from, to };
}
