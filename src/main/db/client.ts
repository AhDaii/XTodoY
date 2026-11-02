import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { migrate, MIGRATIONS } from './migrate';

export type DB = Database.Database;

export function openDatabase(dataDir: string): { db: DB; schemaVersion: number } {
  mkdirSync(dataDir, { recursive: true });
  const db = new Database(join(dataDir, 'xtodoy.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 3000');
  const current = db.pragma('user_version', { simple: true }) as number;
  // 新库无需备份；已有数据的库在迁移前先做一份一致性快照
  if (current > 0 && current < MIGRATIONS.length) backup(db, dataDir, 'pre-migrate');
  const { to } = migrate(db);
  return { db, schemaVersion: to };
}

/**
 * 用 VACUUM INTO 生成一致性快照（同步执行，包含 WAL 中尚未合并的数据）。
 * 数据量在 10 万条完成记录以内时耗时 < 1 秒。
 */
export function backup(db: DB, dataDir: string, kind: 'daily' | 'pre-migrate' | 'pre-update'): string {
  const dir = join(dataDir, 'backups');
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = join(dir, `${kind}-${stamp}.db`);
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  return file;
}
