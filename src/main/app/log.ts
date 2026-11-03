import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { format } from 'node:util';

const MAX_BYTES = 1024 * 1024;

/**
 * 安装版把主进程的 info / warn / error 同时写入 `<数据目录>/logs/main.log`（FR-UPD-09：失败原因写入本地日志）。
 * GUI 程序没有控制台，否则这些输出会丢失。超过 1 MB 时轮换为 main.old.log。
 */
export function installFileLog(dataDir: string): string {
  const dir = join(dataDir, 'logs');
  const file = join(dir, 'main.log');
  mkdirSync(dir, { recursive: true });
  try {
    if (statSync(file).size > MAX_BYTES) renameSync(file, join(dir, 'main.old.log'));
  } catch {
    // 文件还不存在
  }
  for (const level of ['info', 'warn', 'error'] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(...args);
      try {
        appendFileSync(file, `${new Date().toISOString()} ${level.toUpperCase()} ${format(...args)}\n`);
      } catch {
        // 写日志失败不能影响程序
      }
    };
  }
  return file;
}
