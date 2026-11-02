import { DEFAULT_SETTINGS, type Settings } from '@shared/types';
import type { DB } from '../db/client';
import { bus } from '../events/bus';
import { invalid } from './errors';

type Validators = { [K in keyof Settings]: (v: unknown) => Settings[K] };

const bool = (v: unknown, name: string): boolean => {
  if (typeof v === 'boolean') return v;
  throw invalid(`${name}取值不正确`);
};

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
  floatingOpacity: (v) => {
    if (v === 100 || v === 80 || v === 60) return v;
    throw invalid('透明度只能是 100%、80% 或 60%');
  },
  floatingLocked: (v) => bool(v, '锁定位置'),
  autostart: (v) => bool(v, '开机自启'),
  defaultReminder: (v) => {
    if (v === -1 || v === 0 || v === 5 || v === 15 || v === 30 || v === 60) return v;
    throw invalid('默认提醒取值不正确');
  },
  allDayTime: (v) => {
    if (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v)) return v;
    throw invalid('时间格式应为 HH:mm');
  },
  snoozeMinutes: (v) => {
    if (v === 5 || v === 10 || v === 15 || v === 30 || v === 60) return v;
    throw invalid('稍后提醒时长取值不正确');
  },
  reminderSound: (v) => bool(v, '提醒声音'),
  pausedUntil: (v) => {
    if (v === null || (typeof v === 'number' && Number.isFinite(v))) return v;
    throw invalid('暂停时间取值不正确');
  },
  closeTipShown: (v) => bool(v, '关闭提示'),
  sidebarCollapsed: (v) => {
    if (typeof v === 'boolean') return v;
    throw invalid('侧边栏折叠状态取值不正确');
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
