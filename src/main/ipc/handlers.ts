import { app, ipcMain, Menu, nativeTheme } from 'electron';
import { randomUUID } from 'node:crypto';
import { Channels, type AppInfo, type ThemeSetting } from '@shared/ipc';
import type { DB } from '../db/client';
import { bus } from '../events/bus';
import { localDate } from '../domain/time';
import type { TodayService } from '../services/today';
import { destroyFloatingWindow, floatingPosition, moveFloatingBy, showMainWindow, windows } from '../platform/windows';
import { showReminder } from '../platform/notifier';

interface Deps {
  db: DB;
  today: TodayService;
  dataDir: string;
  schemaVersion: number;
  saveFloatingPosition(p: { x: number; y: number }): void;
}

const THEMES: readonly ThemeSetting[] = ['light', 'dark', 'system'];

export function registerIpc(deps: Deps): void {
  const { db, today } = deps;

  ipcMain.handle(Channels.appInfo, (): AppInfo => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: `${process.platform} ${process.arch}`,
    dataDir: deps.dataDir,
    dbSchemaVersion: deps.schemaVersion,
  }));

  ipcMain.handle(Channels.todayGet, () => today.current);

  ipcMain.handle(Channels.settingsSetTheme, (_e, theme: unknown) => {
    if (!THEMES.includes(theme as ThemeSetting)) throw new Error('INVALID_INPUT');
    nativeTheme.themeSource = theme as ThemeSetting;
    const dark = nativeTheme.shouldUseDarkColors;
    // 显式推送给所有窗口：不依赖渲染进程 prefers-color-scheme 的变化时机
    windows.all().forEach((w) => w.webContents.send(Channels.themeChanged, { dark }));
    return { dark };
  });

  // ---- P3 技术验证用：新增一条今天到期的待办、发一条测试通知 ----
  ipcMain.handle(Channels.spikeAddTodo, (_e, title: unknown) => {
    if (typeof title !== 'string' || title.trim().length < 1 || title.length > 200) throw new Error('INVALID_INPUT');
    const now = Date.now();
    db.prepare(
      `INSERT INTO todos (id, title, due_date, sort_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(randomUUID(), title.trim(), localDate(new Date()), String(now), now, now);
    bus.emit('todos.changed');
  });

  ipcMain.handle(Channels.spikeNotify, () => {
    showReminder(
      { todoId: 'spike', title: '评审 XTodoY 界面原型', body: '今天 10:00 · 工作 / 项目A / 设计' },
      {
        open: () => showMainWindow(),
        complete: (id) => console.log('[spike] notification action: complete', id),
        snooze: (id) => console.log('[spike] notification action: snooze', id),
      },
    );
  });

  // ---- 悬浮窗 ----
  ipcMain.on(Channels.floatingOpenMain, () => showMainWindow());
  ipcMain.on(Channels.floatingMoveBy, (_e, dx: unknown, dy: unknown) => {
    if (typeof dx === 'number' && typeof dy === 'number' && Number.isFinite(dx) && Number.isFinite(dy))
      moveFloatingBy(dx, dy);
  });
  ipcMain.on(Channels.floatingDragEnd, () => {
    const p = floatingPosition();
    if (p) deps.saveFloatingPosition(p);
  });
  ipcMain.on(Channels.floatingMenu, () => {
    Menu.buildFromTemplate([
      { label: '打开主窗口', click: () => showMainWindow() },
      { type: 'separator' },
      { label: '隐藏悬浮窗', click: () => destroyFloatingWindow() },
    ]).popup({ window: windows.floating ?? undefined });
  });

  // ---- 主进程事件 → 渲染进程 ----
  bus.on('today.count', (c) => windows.all().forEach((w) => w.webContents.send(Channels.todayCount, c)));
  nativeTheme.on('updated', () => {
    const dark = nativeTheme.shouldUseDarkColors;
    bus.emit('theme.changed', dark);
    windows.all().forEach((w) => w.webContents.send(Channels.themeChanged, { dark }));
  });
}
