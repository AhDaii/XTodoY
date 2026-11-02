import { DEFAULT_SETTINGS, type Settings } from '@shared/types';
import type { DB } from '../db/client';
import { bus } from '../events/bus';
import { invalid } from './errors';

type Validators = { [K in keyof Settings]: (v: unknown) => Settings[K] };

const validators: Validators = {
  theme: (v) => {
    if (v === 'light' || v === 'dark' || v === 'system') return v;
    throw invalid('主题取值不正确');
  },
  weekStart: (v) => {
    if (v === 0 || v === 1) return v;
    throw invalid('周起始日只能是周日或周一');
  },
  closeAction: (v) => {
    if (v === 'tray' || v === 'quit') return v;
    throw invalid('关闭行为取值不正确');
  },
  floatingEnabled: (v) => {
    if (typeof v === 'boolean') return v;
    throw invalid('悬浮窗开关取值不正确');
  },
  floatingPos: (v) => {
    if (v === null) return null;
    const p = v as { x?: unknown; y?: unknown };
    if (typeof p === 'object' && Number.isInteger(p.x) && Number.isInteger(p.y))
      return { x: p.x as number, y: p.y as number };
    throw invalid('悬浮窗位置取值不正确');
  },
};

/** 键值设置（FR-SET-03）：修改即时持久化并广播 settings.changed */
export class SettingsService {
  private cache: Settings;

  constructor(private readonly db: DB) {
    const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
    const stored: Partial<Settings> = {};
    for (const { key, value } of rows) {
      if (!(key in validators)) continue;
      try {
        (stored as Record<string, unknown>)[key] = validators[key as keyof Settings](JSON.parse(value));
      } catch {
        // 忽略损坏或过时的值，回到默认值
      }
    }
    this.cache = { ...DEFAULT_SETTINGS, ...stored };
  }

  get(): Settings {
    return { ...this.cache };
  }

  set<K extends keyof Settings>(key: K, value: unknown): Settings {
    if (!(key in validators)) throw invalid(`未知设置项：${String(key)}`);
    const v = validators[key](value);
    this.db
      .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, JSON.stringify(v));
    this.cache = { ...this.cache, [key]: v };
    bus.emit('settings.changed', { [key]: v } as Partial<Settings>);
    return this.get();
  }
}
