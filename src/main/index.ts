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
  destroyFloatingWindow,
  setTitleBarTheme,
  showMainWindow,
  windows,
} from './platform/windows';
import { TodayService } from './services/today';
import { runMetricsIfRequested } from './app/metrics';

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
let floatingPos: { x: number; y: number } | undefined;

function handleProtocol(argv: string[]): void {
  const url = argv.find((a) => a.startsWith('xtodoy://'));
  const parsed = url ? parseProtocolUrl(url) : null;
  if (!parsed) return;
  // P4/P5 接入 todo 服务；P3 只验证链路能回到主进程
  console.log('[protocol]', parsed);
  if (parsed.action === 'open') showMainWindow();
}

app.on('second-instance', (_e, argv) => {
  if (argv.some((a) => a.startsWith('xtodoy://'))) handleProtocol(argv);
  else showMainWindow();
});

// 关闭所有窗口不退出：托盘常驻（FR-BG-02）
app.on('window-all-closed', () => {});

app.on('before-quit', () => {
  today?.stop();
  db?.close();
});

void app.whenReady().then(() => {
  const dataDir = process.env['XTODOY_DATA_DIR'] ?? join(app.getPath('userData'), 'data');
  const opened = openDatabase(dataDir);
  db = opened.db;
  today = new TodayService(db);

  registerIpc({
    db,
    today,
    dataDir,
    schemaVersion: opened.schemaVersion,
    saveFloatingPosition: (p) => (floatingPos = p),
  });

  bus.on('today.count', updateTrayCount);
  bus.on('time.jumped', () => today?.resync());
  nativeTheme.on('updated', () => setTitleBarTheme(nativeTheme.shouldUseDarkColors));
  watchPower();
  today.start();
  updateTrayCount(today.current);

  createTray({
    openMain: () => showMainWindow(),
    newTodo: () => showMainWindow(),
    toggleFloating: () => (windows.floating ? destroyFloatingWindow() : createFloatingWindow(floatingPos)),
    isFloatingVisible: () => windows.floating !== null,
    pauseReminders: () => {},
    checkUpdate: () => {},
    openSettings: () => showMainWindow(),
    quit: () => app.quit(),
  });

  if (runMetricsIfRequested()) return;

  createFloatingWindow(floatingPos);
  if (!startHidden) showMainWindow();
  handleProtocol(process.argv);
});
