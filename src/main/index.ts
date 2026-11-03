import { app, nativeTheme } from 'electron';
import { join } from 'node:path';
import { openDatabase, type DB } from './db/client';
import { bus } from './events/bus';
import { registerIpc } from './ipc/handlers';
import { parseProtocolUrl, showInfo, showMissed, showReminder } from './platform/notifier';
import { watchPower } from './platform/power';
import { createTray, refreshTrayMenu, updateTrayCount } from './platform/tray';
import {
  applyFloatingPrefs,
  createFloatingWindow,
  onMainWindowClosed,
  setTitleBarTheme,
  showMainWindow,
  windows,
} from './platform/windows';
import { SettingsService } from './services/settings';
import { StatsService } from './services/stats';
import { TagService } from './services/tags';
import { TodayService } from './services/today';
import { TodoService } from './services/todos';
import { Scheduler } from './services/scheduler';
import { notificationBody } from './domain/describe';
import { localDate } from './domain/time';
import { Events, type NavRequest } from '@shared/ipc';
import { runMetricsIfRequested } from './app/metrics';
import { readHardwareAcceleration } from './app/launch-prefs';

// 指定了独立数据目录（测试、试用）时，Chromium 配置与单实例锁也随之隔离，不影响正在运行的正式实例
const customDataDir = process.env['XTODOY_DATA_DIR'];
if (customDataDir) app.setPath('userData', join(customDataDir, 'electron'));

// 单实例（FR-BG-04）：第二个实例把参数交给第一个实例后退出
if (!app.requestSingleInstanceLock()) {
  app.exit(0);
}

const dataDir = customDataDir ?? join(app.getPath('userData'), 'data');

// 硬件加速默认关闭：界面没有重度动画，软件渲染足够，常驻内存约少 20%（spike-report.md §1）。
// 用户可在"设置 › 外观"中开启，重启后生效；XTODOY_ENABLE_GPU=1 可临时强制开启。
const hardwareAcceleration = process.env['XTODOY_ENABLE_GPU'] === '1' || readHardwareAcceleration(dataDir);
if (!hardwareAcceleration) app.disableHardwareAcceleration();

app.setAppUserModelId('com.xtodoy.app');
// 自定义协议只在安装版中注册，开发环境不改动系统注册表
if (app.isPackaged) app.setAsDefaultProtocolClient('xtodoy');

const startHidden = process.argv.includes('--hidden'); // 开机自启时只显示托盘与悬浮窗（FR-BG-05）
let db: DB | null = null;
let today: TodayService | null = null;
let settings: SettingsService | null = null;

/** 打开主窗口并让渲染进程切到指定视图（托盘、通知、悬浮窗调用） */
function openMain(nav?: NavRequest): void {
  const win = showMainWindow();
  if (!nav) return;
  const send = (): void => win.webContents.send(Events.navOpen, nav);
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', send);
  else send();
}

// 由 whenReady 中的服务初始化后赋值；通知按钮与二次启动参数都通过它回到主进程
let reminderActions: { complete(id: string): void; snooze(id: string): void } | null = null;

function handleProtocol(argv: string[]): void {
  const url = argv.find((a) => a.startsWith('xtodoy://'));
  const parsed = url ? parseProtocolUrl(url) : null;
  if (!parsed) return;
  if (parsed.action === 'open') openMain({ todoId: parsed.id });
  else if (parsed.action === 'complete') reminderActions?.complete(parsed.id);
  else reminderActions?.snooze(parsed.id);
}

app.on('second-instance', (_e, argv) => {
  if (argv.some((a) => a.startsWith('xtodoy://'))) handleProtocol(argv);
  else openMain();
});

// 关闭所有窗口不退出：托盘常驻（FR-BG-02）；"关闭即退出"在主窗口关闭时处理
app.on('window-all-closed', () => {});

// 退出顺序：before-quit 标记正在退出（窗口关闭回调不再写库、不再发提示）→ 窗口关闭 → will-quit 关闭数据库
let quitting = false;
app.on('before-quit', () => {
  quitting = true;
  today?.stop();
});
app.on('will-quit', () => {
  db?.close();
});

/** 开机自启（FR-BG-05）：只在安装版注册，开发环境不改动系统登录项 */
function applyAutostart(on: boolean): void {
  if (!app.isPackaged) return;
  app.setLoginItemSettings({ openAtLogin: on, args: ['--hidden'] });
}

void app.whenReady().then(() => {
  const opened = openDatabase(dataDir);
  db = opened.db;
  settings = new SettingsService(db);
  const s = settings;
  const tags = new TagService(db);
  const todos = new TodoService(db, tags, () => s.get());
  today = new TodayService(db);
  todos.purgeExpired();
  nativeTheme.themeSource = s.get().theme;

  // ---- 提醒（FR-REM）：调度器 → 系统通知 → 按钮回到待办服务 ----
  const handlers = {
    open: (id: string) => openMain({ todoId: id }),
    complete: (id: string) => {
      try {
        if (todos.get(id).status === 'open') todos.toggle(id);
      } catch {
        // 事项已被删除：忽略
      }
    },
    snooze: (id: string) => scheduler.snooze(id),
  };
  reminderActions = handlers;
  const scheduler = new Scheduler(db, () => s.get(), {
    remind: (ids) => {
      const { snoozeMinutes, reminderSound } = s.get();
      for (const id of ids) {
        const t = todos.get(id);
        showReminder({ todoId: id, title: t.title, body: notificationBody(t, localDate(new Date())) }, handlers, {
          snoozeMinutes,
          sound: reminderSound,
        });
      }
    },
    remindMissed: (ids) => showMissed(ids.length, () => openMain({ view: 'today' }), s.get().reminderSound),
  });

  registerIpc({
    todos,
    tags,
    settings: s,
    stats: new StatsService(db, () => s.get()),
    today,
    scheduler,
    dataDir,
    schemaVersion: opened.schemaVersion,
    hardwareAcceleration,
  });

  bus.on('today.count', updateTrayCount);
  bus.on('time.jumped', () => today?.resync());
  bus.on('reminders.resumed', () => s.set('pausedUntil', null));
  bus.on('settings.changed', (patch) => {
    if (patch.floatingEnabled === true) {
      createFloatingWindow(s.get().floatingPos ?? undefined);
      applyFloatingPrefs({ opacity: s.get().floatingOpacity, locked: s.get().floatingLocked });
    }
    if (patch.floatingOpacity !== undefined || patch.floatingLocked !== undefined) {
      applyFloatingPrefs({ opacity: s.get().floatingOpacity, locked: s.get().floatingLocked });
    }
    if (patch.autostart !== undefined) applyAutostart(patch.autostart);
    refreshTrayMenu();
  });
  nativeTheme.on('updated', () => setTitleBarTheme(nativeTheme.shouldUseDarkColors));
  watchPower();
  today.start();
  scheduler.start();
  updateTrayCount(today.current);
  app.on('before-quit', () => scheduler.stop());

  createTray({
    openMain: () => openMain(),
    newTodo: () => openMain({ view: 'today', focus: 'quick-add' }),
    toggleFloating: () => s.set('floatingEnabled', windows.floating === null),
    isFloatingVisible: () => windows.floating !== null,
    pauseReminders: (kind) => {
      const d = new Date();
      const until =
        kind === 'hour' ? Date.now() + 3_600_000 : new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
      s.set('pausedUntil', until);
    },
    resumeReminders: () => s.set('pausedUntil', null),
    pausedUntil: () => s.get().pausedUntil,
    checkUpdate: () => openMain({ view: 'settings' }),
    openSettings: () => openMain({ view: 'settings' }),
    quit: () => app.quit(),
  });

  onMainWindowClosed(() => {
    if (quitting) return;
    const { closeAction, closeTipShown } = s.get();
    if (closeAction === 'quit') return app.quit();
    // 首次关闭时提示一次仍在后台运行（FR-BG-02）
    if (!closeTipShown) {
      s.set('closeTipShown', true);
      showInfo('XTodoY 仍在后台运行', '可以从托盘图标或悬浮窗重新打开，提醒会照常推送。', () => openMain());
    }
  });

  if (runMetricsIfRequested()) return;

  if (s.get().floatingEnabled) {
    createFloatingWindow(s.get().floatingPos ?? undefined);
    applyFloatingPrefs({ opacity: s.get().floatingOpacity, locked: s.get().floatingLocked });
  }
  if (!startHidden) showMainWindow();
  handleProtocol(process.argv);
});
