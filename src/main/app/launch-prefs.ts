import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 读取必须在 app ready 之前确定的设置（目前只有"硬件加速"）。
 * 此时设置服务尚未创建，直接以只读方式打开数据库读取；数据库不存在或读取失败时使用默认值（关闭）。
 */
export function readHardwareAcceleration(dataDir: string): boolean {
  const file = join(dataDir, 'xtodoy.db');
  if (!existsSync(file)) return false;
  let db: Database.Database | null = null;
  try {
    db = new Database(file, { readonly: true, fileMustExist: true });
    const row = db.prepare("SELECT value FROM settings WHERE key = 'hardwareAcceleration'").get() as
      { value: string } | undefined;
    return row ? JSON.parse(row.value) === true : false;
  } catch {
    return false;
  } finally {
    db?.close();
  }
}
