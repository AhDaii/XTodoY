import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { migrate, MIGRATIONS } from './migrate';

export type DB = Database.Database;

/** 数据库文件损坏（NFR-REL-02）：由启动流程提示用户从备份恢复 */
export class DbCorruptError extends Error {
  constructor(cause?: unknown) {
    super('数据库文件已损坏', { cause });
  }
}

/** 迁移失败（NFR-REL-03）：迁移在事务中执行，失败时数据库保持原样 */
export class DbMigrationError extends Error {
  constructor(
    readonly from: number,
    readonly to: number,
    cause?: unknown,
  ) {
    super(from > to ? '数据库版本高于程序版本' : '数据库升级失败', { cause });
  }
}

const CORRUPT_CODES = new Set(['SQLITE_CORRUPT', 'SQLITE_NOTADB', 'SQLITE_CORRUPT_INDEX']);

export function openDatabase(dataDir: string): { db: DB; schemaVersion: number } {
  mkdirSync(dataDir, { recursive: true });
  const file = join(dataDir, 'xtodoy.db');
  const existed = existsSync(file);
  const db: DB = new Database(file);
  try {
    db.pragma('journal_mode = WAL');
    // 已有的库先做快速完整性检查（10 万条记录约 0.1 秒）
    if (existed && db.pragma('quick_check', { simple: true }) !== 'ok') throw new DbCorruptError();
  } catch (e) {
    // 必须先关闭连接，否则文件被占用，恢复时无法移走损坏的库
    db.close();
    if (e instanceof DbCorruptError) throw e;
    if (CORRUPT_CODES.has((e as { code?: string }).code ?? '')) throw new DbCorruptError(e);
    throw e;
  }
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 3000');
  const current = db.pragma('user_version', { simple: true }) as number;
  // 新库无需备份；已有数据的库在迁移前先做一份一致性快照
  if (current > 0 && current < MIGRATIONS.length) backup(db, dataDir, 'pre-migrate');
  try {
    const { to } = migrate(db);
    return { db, schemaVersion: to };
  } catch (e) {
    db.close();
    throw new DbMigrationError(current, MIGRATIONS.length, e);
  }
}

/**
 * 用 VACUUM INTO 生成一致性快照（同步执行，包含 WAL 中尚未合并的数据）。
 * 数据量在 10 万条完成记录以内时耗时 < 1 秒。
 */
export function backup(db: DB, dataDir: string, kind: 'daily' | 'pre-migrate' | 'pre-update' | 'pre-import'): string {
  const dir = join(dataDir, 'backups');
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = join(dir, `${kind}-${stamp}.db`);
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  return file;
}
