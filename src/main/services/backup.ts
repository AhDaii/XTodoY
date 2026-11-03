import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { ImportSummary } from '@shared/ipc';
import { backup, type DB } from '../db/client';
import { localDate } from '../domain/time';
import { bus } from '../events/bus';
import { AppError } from './errors';
import type { SettingsService } from './settings';

/** 每种备份保留的份数（DR-05；导入前备份与更新前备份同样保留 2 份） */
const KEEP = { daily: 7, 'pre-migrate': 2, 'pre-update': 2, 'pre-import': 2 } as const;
export type BackupKind = keyof typeof KEEP;

/** JSON 导出格式（DR-06）；行保持数据库列名，便于无损往返 */
export interface ExportFile {
  app: 'XTodoY';
  schemaVersion: number;
  exportedAt: string;
  todos: Row[];
  tags: Row[];
  todoTags: Row[];
  reminders: Row[];
  completionLogs: Row[];
  settings: Record<string, unknown>;
}
type Row = Record<string, unknown>;

/** 导入顺序满足外键：先标签（按层级）与事项，再关联表 */
const TABLES = [
  ['tags', 'tags'],
  ['todos', 'todos'],
  ['todoTags', 'todo_tags'],
  ['reminders', 'reminders'],
  ['completionLogs', 'completion_logs'],
] as const;

/** 数据备份（FR-SET-06/07）：每日自动备份、JSON 导出 / 导入 */
export class BackupService {
  constructor(
    private readonly db: DB,
    private readonly dataDir: string,
    private readonly settings: SettingsService,
    private readonly schemaVersion: number,
  ) {}

  get dir(): string {
    return join(this.dataDir, 'backups');
  }

  /** 生成快照并清理同类旧备份 */
  snapshot(kind: BackupKind): string {
    const file = backup(this.db, this.dataDir, kind);
    this.prune(kind);
    return file;
  }

  /** 每天首次启动时备份（FR-SET-07）；返回备份文件，今天已备份过则返回 null */
  daily(now = new Date()): string | null {
    const today = localDate(now);
    const last = this.db.prepare("SELECT value FROM meta WHERE key = 'last_backup_date'").pluck().get();
    if (last === today) return null;
    const file = this.snapshot('daily');
    this.prune('pre-migrate');
    this.db
      .prepare(
        "INSERT INTO meta (key, value) VALUES ('last_backup_date', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(today);
    return file;
  }

  /** 最近一次每日备份的日期（设置页显示） */
  lastBackupDate(): string | null {
    return (this.db.prepare("SELECT value FROM meta WHERE key = 'last_backup_date'").pluck().get() as string) ?? null;
  }

  private prune(kind: BackupKind): void {
    // 文件名带 ISO 时间戳，按名称排序即按时间排序
    const files = readdirSync(this.dir)
      .filter((f) => f.startsWith(`${kind}-`) && f.endsWith('.db'))
      .sort();
    for (const f of files.slice(0, Math.max(0, files.length - KEEP[kind]))) rmSync(join(this.dir, f), { force: true });
  }

  exportData(now = new Date()): ExportFile {
    const all = (table: string) => this.db.prepare(`SELECT * FROM ${table}`).all() as Row[];
    const settings: Record<string, unknown> = {};
    for (const { key, value } of this.db.prepare('SELECT key, value FROM settings').all() as {
      key: string;
      value: string;
    }[]) {
      try {
        settings[key] = JSON.parse(value);
      } catch {
        // 跳过损坏的设置值
      }
    }
    return {
      app: 'XTodoY',
      schemaVersion: this.schemaVersion,
      exportedAt: now.toISOString(),
      todos: all('todos'),
      tags: this.db.prepare('SELECT * FROM tags ORDER BY depth').all() as Row[],
      todoTags: all('todo_tags'),
      reminders: all('reminders'),
      completionLogs: all('completion_logs'),
      settings,
    };
  }

  /**
   * 用备份文件覆盖当前数据（FR-SET-06）。覆盖前自动备份当前数据库；
   * 整个替换在一个事务内完成，文件内容不合法时回滚，当前数据保持不变。
   */
  importData(raw: unknown): ImportSummary {
    const data = parseExport(raw, this.schemaVersion);
    this.snapshot('pre-import');
    const columns = (table: string) =>
      new Set((this.db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name));
    try {
      this.db.transaction(() => {
        for (const [, table] of [...TABLES].reverse()) this.db.exec(`DELETE FROM ${table}`);
        this.db.exec('DELETE FROM settings');
        for (const [key, table] of TABLES) {
          const known = columns(table);
          const rows =
            key === 'tags' ? [...data.tags].sort((a, b) => Number(a['depth']) - Number(b['depth'])) : data[key];
          for (const row of rows) {
            const cols = Object.keys(row).filter((c) => known.has(c));
            if (!cols.length) throw new Error(`${table} 行为空`);
            this.db
              .prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map((c) => `@${c}`).join(', ')})`)
              .run(Object.fromEntries(cols.map((c) => [c, row[c]])));
          }
        }
        const put = this.db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
        for (const [k, v] of Object.entries(data.settings)) put.run(k, JSON.stringify(v));
      })();
    } catch (e) {
      console.error('[backup] import failed', e);
      throw new AppError('IMPORT_INVALID', '备份文件内容不完整或已损坏，当前数据未做改动');
    }
    this.settings.reload();
    bus.emit('tags.changed');
    bus.emit('todos.changed');
    return { todos: data.todos.length, tags: data.tags.length, completionLogs: data.completionLogs.length };
  }
}

/** 校验导出文件的外层结构；行内容由数据库约束（CHECK / 外键）在事务中校验 */
export function parseExport(raw: unknown, currentSchema: number): ExportFile {
  const bad = (msg: string) => new AppError('IMPORT_INVALID', msg);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw bad('不是 XTodoY 备份文件');
  const o = raw as Record<string, unknown>;
  if (o['app'] !== 'XTodoY') throw bad('不是 XTodoY 备份文件');
  const v = o['schemaVersion'];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) throw bad('备份文件缺少数据版本');
  if (v > currentSchema) throw bad('备份来自更新版本的 XTodoY，请先升级程序再导入');
  for (const [key] of TABLES) {
    const rows = o[key];
    if (!Array.isArray(rows) || rows.some((r) => !r || typeof r !== 'object' || Array.isArray(r)))
      throw bad('备份文件内容不完整或已损坏');
  }
  const s = o['settings'];
  if (s !== undefined && (typeof s !== 'object' || s === null || Array.isArray(s)))
    throw bad('备份文件内容不完整或已损坏');
  return { ...(o as unknown as ExportFile), settings: (s as Record<string, unknown>) ?? {} };
}
