import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** 数据库损坏时的恢复（NFR-REL-02）：不删除任何文件，损坏的库移到 corrupt/ 子目录保留 */

const DB = 'xtodoy.db';

/** backups/ 中最新的备份（任意类型，按修改时间）；没有备份时返回 null */
export function latestBackup(dataDir: string): { file: string; at: Date } | null {
  const dir = join(dataDir, 'backups');
  if (!existsSync(dir)) return null;
  let best: { file: string; at: Date } | null = null;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.db')) continue;
    const file = join(dir, name);
    const at = statSync(file).mtime;
    if (statSync(file).size > 0 && (!best || at > best.at)) best = { file, at };
  }
  return best;
}

/** 把当前数据库（含 -wal / -shm）移到 corrupt/，返回移动后的路径 */
export function setAsideDatabase(dataDir: string, now = new Date()): string {
  const dir = join(dataDir, 'corrupt');
  mkdirSync(dir, { recursive: true });
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const target = join(dir, `xtodoy-${stamp}.db`);
  for (const suffix of ['', '-wal', '-shm']) {
    const src = join(dataDir, DB + suffix);
    if (existsSync(src)) renameSync(src, target + suffix);
  }
  return target;
}

/** 用备份替换损坏的数据库；返回损坏文件保存的位置 */
export function restoreFromBackup(dataDir: string, backupFile: string, now = new Date()): string {
  const aside = setAsideDatabase(dataDir, now);
  copyFileSync(backupFile, join(dataDir, DB));
  return aside;
}
