import { app, BrowserWindow, nativeTheme, screen, shell, type BrowserWindowConstructorOptions } from 'electron';

const isMac = process.platform === 'darwin';
import { Events } from '@shared/ipc';
import { preloadPath, rendererEntry, resourcePath } from '../app/paths';
import { cardVisible, clampToArea, snapToEdges } from '../domain/floating';

// 64 × 78 日历页 + 四周 8 px 投影（设计系统 §7.5）
const FLOATING_W = 80;
const FLOATING_H = 94;
// 日历页距屏幕边缘 24 px（窗口四周已有 8 px 投影留白）
const EDGE_MARGIN = 16;

const secure: BrowserWindowConstructorOptions['webPreferences'] = {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  spellcheck: false,
  backgroundThrottling: true,
};

function harden(win: BrowserWindow): void {
  // 禁止页面内导航与新窗口；外部链接只允许 https（architecture.md §4）
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
}

/** 页面加载完成后推送当前主题：渲染进程的 prefers-color-scheme 不一定反映 themeSource（spike-report §8） */
function pushTheme(win: BrowserWindow): void {
  win.webContents.on('did-finish-load', () =>
    win.webContents.send(Events.themeChanged, { dark: nativeTheme.shouldUseDarkColors }),
  );
}

function load(win: BrowserWindow, page: 'main' | 'floating'): void {
  pushTheme(win);
  // 渲染进程的错误写入主进程日志（安装版为 logs/main.log），否则界面出错时无从排查（NFR-REL-04）
  win.webContents.on('console-message', (e) => {
    if (e.level === 'error') console.error(`[renderer:${page}] ${e.message} (${e.sourceId}:${e.lineNumber})`);
  });
  const entry = rendererEntry(page);
  if (entry.url) void win.loadURL(entry.url);
  else void win.loadFile(entry.file!);
}

let mainWin: BrowserWindow | null = null;
const mainClosedHandlers: (() => void)[] = [];

export function onMainWindowClosed(fn: () => void): void {
  mainClosedHandlers.push(fn);
}
let floatingWin: BrowserWindow | null = null;

export const windows = {
  get main(): BrowserWindow | null {
    return mainWin && !mainWin.isDestroyed() ? mainWin : null;
  },
  get floating(): BrowserWindow | null {
    return floatingWin && !floatingWin.isDestroyed() ? floatingWin : null;
  },
  all(): BrowserWindow[] {
    return [this.main, this.floating].filter((w): w is BrowserWindow => w !== null);
  },
};

/** 显示主窗口：已存在则恢复并聚焦，否则创建（FR-FLT-02、FR-BG-01） */
export function showMainWindow(): BrowserWindow {
  const existing = windows.main;
  if (existing) {
    if (existing.isMinimized()) existing.restore();
    existing.show();
    existing.focus();
    return existing;
  }
  const dark = nativeTheme.shouldUseDarkColors;
  mainWin = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 800,
    minHeight: 560,
    show: false,
    title: 'XTodoY',
    // 显式设置窗口图标：否则开发模式与 Linux 下任务栏、Alt+Tab 显示 Electron 默认图标（#23）
    icon: resourcePath('icon.png'),
    backgroundColor: dark ? '#0a1020' : '#f4f7ff',
    // 自绘标题栏：Windows / Linux 用系统绘制的右侧按钮（titleBarOverlay），macOS 用左侧红绿灯
    ...(isMac
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 14, y: 13 } }
      : {
          titleBarStyle: 'hidden' as const,
          titleBarOverlay: {
            color: dark ? '#0c1324' : '#eaf0fd',
            symbolColor: dark ? '#e2e8f0' : '#0f172a',
            height: 40,
          },
        }),
    webPreferences: { ...secure, preload: preloadPath('main') },
  });
  harden(mainWin);
  // macOS：主窗口打开时显示 Dock 图标，关闭后只留菜单栏图标（与 Windows 托盘常驻一致）
  if (isMac) void app.dock?.show();
  mainWin.once('ready-to-show', () => mainWin?.show());
  // 关闭即销毁（不是隐藏），释放渲染进程内存；托盘与悬浮窗继续工作
  mainWin.on('closed', () => {
    mainWin = null;
    if (isMac) app.dock?.hide();
    mainClosedHandlers.forEach((fn) => fn());
  });
  load(mainWin, 'main');
  return mainWin;
}

export function setTitleBarTheme(dark: boolean): void {
  if (isMac) return;
  windows.main?.setTitleBarOverlay({ color: dark ? '#0c1324' : '#eaf0fd', symbolColor: dark ? '#e2e8f0' : '#0f172a' });
}

/** 悬浮窗：64×64、无边框、透明、置顶、不进任务栏、不抢焦点（FR-FLT-01） */
export function createFloatingWindow(saved?: { x: number; y: number }): BrowserWindow {
  if (windows.floating) return windows.floating;
  const pos = validPosition(saved) ?? defaultPosition();
  floatingWin = new BrowserWindow({
    ...pos,
    width: FLOATING_W,
    height: FLOATING_H,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    icon: resourcePath('icon.png'),
    focusable: false,
    hasShadow: false,
    show: false,
    webPreferences: { ...secure, preload: preloadPath('floating') },
  });
  floatingWin.setAlwaysOnTop(true, 'screen-saver');
  floatingWin.setVisibleOnAllWorkspaces(true);
  harden(floatingWin);
  floatingWin.once('ready-to-show', () => floatingWin?.showInactive());
  floatingWin.on('closed', () => (floatingWin = null));
  load(floatingWin, 'floating');
  return floatingWin;
}

export function destroyFloatingWindow(): void {
  windows.floating?.destroy();
}

let floatingLocked = false;

/** 透明度（100 / 80 / 60）与锁定位置（FR-FLT-05） */
export function applyFloatingPrefs(p: { opacity: number; locked: boolean }): void {
  floatingLocked = p.locked;
  windows.floating?.setOpacity(p.opacity / 100);
}

const FLOATING_SIZE = { width: FLOATING_W, height: FLOATING_H };
/** 窗口四周透明的投影留白；卡片 = 窗口向内缩 8 px */
const CARD_INSET = 8;

/** 鼠标所在显示器的工作区：拖到另一块屏幕时随之切换 */
const areaUnderCursor = () => screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;

/** 拖动：卡片始终完整留在鼠标所在屏幕的工作区内（rc.1 反馈：拖到边缘时显示不全） */
export function moveFloatingBy(dx: number, dy: number): void {
  const win = windows.floating;
  if (!win || floatingLocked) return;
  const [x = 0, y = 0] = win.getPosition();
  const p = clampToArea({ x: x + dx, y: y + dy }, FLOATING_SIZE, areaUnderCursor(), CARD_INSET);
  win.setPosition(p.x, p.y);
}

/** 松开：靠近屏幕边缘（20 px 内）时贴边吸附，返回最终位置 */
export function snapFloating(): { x: number; y: number } | null {
  const win = windows.floating;
  if (!win) return null;
  const [x = 0, y = 0] = win.getPosition();
  const p = snapToEdges({ x, y }, FLOATING_SIZE, areaUnderCursor(), CARD_INSET);
  win.setPosition(p.x, p.y);
  return p;
}

function defaultPosition(): { x: number; y: number } {
  const { workArea } = screen.getPrimaryDisplay();
  return {
    x: workArea.x + workArea.width - FLOATING_W - EDGE_MARGIN,
    y: workArea.y + workArea.height - FLOATING_H - EDGE_MARGIN,
  };
}

/** 记忆位置所在的显示器已不存在或超出屏幕时返回 null（FR-FLT-04） */
function validPosition(p?: { x: number; y: number }): { x: number; y: number } | null {
  if (!p) return null;
  // 按卡片判断（贴边吸附时窗口的透明留白会超出屏幕）
  const areas = screen.getAllDisplays().map((d) => d.workArea);
  return cardVisible(p, FLOATING_SIZE, areas, CARD_INSET) ? p : null;
}
