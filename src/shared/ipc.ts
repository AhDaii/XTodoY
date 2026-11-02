// 主进程与渲染进程共用的 IPC 类型与通道名（完整接口见 docs/design/ipc.md）

export type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

export interface TodayCount {
  open: number;
  done: number;
  total: number;
}

export type ThemeSetting = 'light' | 'dark' | 'system';

export interface AppInfo {
  version: string;
  electron: string;
  chrome: string;
  node: string;
  platform: string;
  dataDir: string;
  dbSchemaVersion: number;
}

export const Channels = {
  appInfo: 'app:info',
  todayGet: 'today:get',
  todayCount: 'today:count',
  themeChanged: 'theme:changed',
  settingsSetTheme: 'settings:setTheme',
  spikeNotify: 'spike:notify',
  spikeAddTodo: 'spike:addTodo',
  floatingOpenMain: 'floating:openMain',
  floatingMoveBy: 'floating:moveBy',
  floatingDragEnd: 'floating:dragEnd',
  floatingMenu: 'floating:menu',
} as const;

/** 主窗口 preload 暴露的 API（P3 脚手架阶段的子集，P4 起按 ipc.md 扩充） */
export interface XtodoyApi {
  appInfo(): Promise<AppInfo>;
  getToday(): Promise<TodayCount>;
  /** 返回切换后实际是否为深色（跟随系统时取决于系统设置） */
  setTheme(theme: ThemeSetting): Promise<{ dark: boolean }>;
  spikeNotify(): Promise<void>;
  spikeAddTodo(title: string): Promise<void>;
  onTodayCount(cb: (c: TodayCount) => void): () => void;
  onThemeChanged(cb: (p: { dark: boolean }) => void): () => void;
}

/** 悬浮窗 preload 暴露的最小 API */
export interface FloatingApi {
  getToday(): Promise<TodayCount>;
  openMain(): void;
  moveBy(dx: number, dy: number): void;
  dragEnd(): void;
  showMenu(): void;
  onTodayCount(cb: (c: TodayCount) => void): () => void;
  onThemeChanged(cb: (p: { dark: boolean }) => void): () => void;
}
