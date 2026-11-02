import { app, nativeTheme } from 'electron';
import { join } from 'node:path';
import { openDatabase, type DB } from './db/client';
import { bus } from './events/bus';
import { registerIpc } from './ipc/handlers';
import { parseProtocolUrl } from './platform/notifier';
import { watchPower } from './platform/power';
import { createTray, updateTrayCount } from './platform/tray';
import {
  createFloatingWindow,
  onMainWindowClosed,
  setTitleBarTheme,
  showMainWindow,
  windows,
} from './platform/windows';
import { SettingsService } from './services/settings';
import { TagService } from './services/tags';
import { TodayService } from './services/today';
import { TodoService } from './services/todos';
import { Events, type NavRequest } from '@shared/ipc';
import { runMetricsIfRequested } from './app/metrics';

// 指定了独立数据目录（测试、试用）时，Chromium 配置与单实例锁也随之隔离，不影响正在运行的正式实例
const customDataDir = process.env['XTODOY_DATA_DIR'];
if (customDataDir) app.setPath('userData', join(customDataDir, 'electron'));

// 单实例（FR-BG-04）：第二个实例把参数交给第一个实例后退出
if (!app.requestSingleInstanceLock()) {
  app.exit(0);
}

// 关闭硬件加速：界面没有重度动画，软件渲染足够；仅托盘时内存约减少 20%（spike-report.md §1）。
// XTODOY_ENABLE_GPU=1 可临时打开，用于对比或排查渲染问题。
if (!process.env['XTODOY_ENABLE_GPU']) app.disableHardwareAcceleration();

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

function handleProtocol(argv: string[]): void {
  const url = argv.find((a) => a.startsWith('xtodoy://'));
  const parsed = url ? parseProtocolUrl(url) : null;
  if (!parsed) return;
  // P5 接入提醒后，complete / snooze 将调用待办服务；P4 只处理"打开"
  console.log('[protocol]', parsed);
  if (parsed.action === 'open') openMain({ todoId: parsed.id });
}

app.on('second-instance', (_e, argv) => {
  if (argv.some((a) => a.startsWith('xtodoy://'))) handleProtocol(argv);
  else openMain();
});

// 关闭所有窗口不退出：托盘常驻（FR-BG-02）；"关闭即退出"在主窗口关闭时处理
app.on('window-all-closed', () => {});

app.on('before-quit', () => {
  today?.stop();
  db?.close();
});

void app.whenReady().then(() => {
  const dataDir = customDataDir ?? join(app.getPath('userData'), 'data');
  const opened = openDatabase(dataDir);
  db = opened.db;
  settings = new SettingsService(db);
  const tags = new TagService(db);
  const todos = new TodoService(db, tags, () => settings!.get());
  today = new TodayService(db);
  todos.purgeExpired();
  nativeTheme.themeSource = settings.get().theme;

  registerIpc({ todos, tags, settings, today, dataDir, schemaVersion: opened.schemaVersion });

  bus.on('today.count', updateTrayCount);
  bus.on('time.jumped', () => today?.resync());
  bus.on('settings.changed', (patch) => {
    if (patch.floatingEnabled === true) createFloatingWindow(settings!.get().floatingPos ?? undefined);
  });
  nativeTheme.on('updated', () => setTitleBarTheme(nativeTheme.shouldUseDarkColors));
  watchPower();
  today.start();
  updateTrayCount(today.current);

  createTray({
    openMain: () => openMain(),
    newTodo: () => openMain({ view: 'today' }),
    toggleFloating: () => settings!.set('floatingEnabled', windows.floating === null),
    isFloatingVisible: () => windows.floating !== null,
    pauseReminders: () => {},
    checkUpdate: () => {},
    openSettings: () => openMain({ view: 'settings' }),
    quit: () => app.quit(),
  });

  onMainWindowClosed(() => {
    if (settings!.get().closeAction === 'quit') app.quit();
  });

  if (runMetricsIfRequested()) return;

  if (settings.get().floatingEnabled) createFloatingWindow(settings.get().floatingPos ?? undefined);
  if (!startHidden) showMainWindow();
  handleProtocol(process.argv);
});
