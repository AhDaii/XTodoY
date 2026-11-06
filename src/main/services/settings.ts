import { defaultQuickAddShortcut } from '@shared/platform';
import { isValidAccelerator } from '@shared/shortcut';
import { DEFAULT_SETTINGS, SORT_MODES, UI_SOUND_STYLES, type Settings, type SortMode } from '@shared/types';
import type { ReleaseNote } from '@shared/update';
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
  uiSound: (v) => bool(v, '界面音效'),
  uiSoundStyle: (v) => {
    if (UI_SOUND_STYLES.includes(v as Settings['uiSoundStyle'])) return v as Settings['uiSoundStyle'];
    throw invalid('音效风格取值不正确');
  },
  uiSoundVolume: (v) => {
    if (typeof v === 'number' && v >= 0 && v <= 1) return Math.round(v * 100) / 100;
    throw invalid('音量应在 0 到 1 之间');
  },
  pausedUntil: (v) => {
    if (v === null || (typeof v === 'number' && Number.isFinite(v))) return v;
    throw invalid('暂停时间取值不正确');
  },
  closeTipShown: (v) => bool(v, '关闭提示'),
  hardwareAcceleration: (v) => bool(v, '硬件加速'),
  listSort: (v) => {
    const o = v as Record<string, unknown>;
    const scopes = ['today', 'plan', 'all', 'tag'] as const;
    if (
      typeof o === 'object' &&
      o !== null &&
      Object.keys(o).length === scopes.length &&
      scopes.every((k) => SORT_MODES.includes(o[k] as SortMode))
    )
      return { today: o['today'], plan: o['plan'], all: o['all'], tag: o['tag'] } as Settings['listSort'];
    throw invalid('排序方式取值不正确');
  },
  autoCheckUpdate: (v) => bool(v, '自动检查更新'),
  updateNotes: (v) => {
    if (v === null) return null;
    const o = v as { version?: unknown; releaseDate?: unknown; notes?: unknown };
    const okNote = (n: unknown) => {
      const x = n as { kind?: unknown; text?: unknown };
      return (
        [null, 'new', 'imp', 'fix'].includes(x?.kind as string | null) &&
        typeof x.text === 'string' &&
        x.text.length <= 500
      );
    };
    if (
      typeof o === 'object' &&
      typeof o.version === 'string' &&
      o.version.length <= 64 &&
      typeof o.releaseDate === 'string' &&
      o.releaseDate.length <= 40 &&
      Array.isArray(o.notes) &&
      o.notes.length <= 50 &&
      o.notes.every(okNote)
    )
      return { version: o.version, releaseDate: o.releaseDate, notes: o.notes as ReleaseNote[] };
    throw invalid('更新说明取值不正确');
  },
  holidayAutoUpdate: (v) => bool(v, '自动更新节假日'),
  holidayCheckedAt: (v) => {
    if (v === null || (typeof v === 'number' && Number.isFinite(v))) return v;
    throw invalid('节假日检查时间取值不正确');
  },
  autoDownloadUpdate: (v) => bool(v, '自动下载更新'),
  updateChannel: (v) => {
    if (v === 'stable' || v === 'beta') return v;
    throw invalid('更新通道取值不正确');
  },
  update: (v) => {
    const o = v as Record<string, unknown>;
    const ver = (x: unknown) => x === null || (typeof x === 'string' && x.length <= 64);
    if (
      typeof o === 'object' &&
      o !== null &&
      (o['lastCheckAt'] === null || Number.isFinite(o['lastCheckAt'])) &&
      ['skipped', 'notifiedAvailable', 'notifiedReady', 'lastRunVersion', 'banner'].every((k) => ver(o[k]))
    )
      return {
        lastCheckAt: o['lastCheckAt'] as number | null,
        skipped: o['skipped'] as string | null,
        notifiedAvailable: o['notifiedAvailable'] as string | null,
        notifiedReady: o['notifiedReady'] as string | null,
        lastRunVersion: o['lastRunVersion'] as string | null,
        banner: o['banner'] as string | null,
      };
    throw invalid('更新状态取值不正确');
  },
  quickAddShortcut: (v) => {
    if (v === null || (typeof v === 'string' && isValidAccelerator(v))) return v;
    throw invalid('快捷键需要包含 Ctrl、Alt 或 Win 之一，再加一个按键');
  },
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
    this.cache = this.load();
  }

  private load(): Settings {
    const rows = this.db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
    const stored: Partial<Settings> = {};
    for (const { key, value } of rows) {
      if (!(key in validators)) continue;
      try {
        (stored as Record<string, unknown>)[key] = validators[key as keyof Settings](JSON.parse(value));
      } catch {
        // 忽略损坏或过时的值，回到默认值
      }
    }
    // 全局快捷键默认值随平台变化（macOS 为 ⌘⌥T）
    return { ...DEFAULT_SETTINGS, quickAddShortcut: defaultQuickAddShortcut(process.platform), ...stored };
  }

  /** 设置表被整体替换后（导入备份）重新读取，并广播全部设置 */
  reload(): void {
    this.cache = this.load();
    bus.emit('settings.changed', this.get());
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
