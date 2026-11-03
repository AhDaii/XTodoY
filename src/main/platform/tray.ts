import { app, Menu, nativeImage, nativeTheme, Tray } from 'electron';
import type { TodayCount } from '@shared/ipc';
import { resourcePath } from '../app/paths';
import { quickAddShortcut } from './shortcut';

export interface TrayActions {
  openMain(): void;
  newTodo(): void;
  toggleFloating(): void;
  isFloatingVisible(): boolean;
  pauseReminders(kind: 'hour' | 'tomorrow'): void;
  resumeReminders(): void;
  pausedUntil(): number | null;
  checkUpdate(): void;
  openSettings(): void;
  quit(): void;
}

let tray: Tray | null = null;
let refreshMenu: () => void = () => {};

/** 设置变化（悬浮窗开关、暂停提醒）后刷新托盘菜单的勾选与文字 */
export function refreshTrayMenu(): void {
  refreshMenu();
}

function icon(): Electron.NativeImage {
  // 浅色任务栏用深色剪影，深色任务栏用浅色剪影（IR-04）
  const file = nativeTheme.shouldUseDarkColors ? 'tray-dark.png' : 'tray-light.png';
  return nativeImage.createFromPath(resourcePath(file));
}

export function createTray(actions: TrayActions): Tray {
  tray = new Tray(icon());
  tray.setToolTip('XTodoY');
  tray.on('click', () => actions.openMain());
  const rebuild = (): void => {
    tray?.setContextMenu(
      Menu.buildFromTemplate([
        { label: '打开主窗口', click: actions.openMain },
        { label: '新建待办', accelerator: quickAddShortcut() ?? undefined, click: actions.newTodo },
        { label: '显示悬浮窗', type: 'checkbox', checked: actions.isFloatingVisible(), click: actions.toggleFloating },
        pausedItem(actions),
        { label: '检查更新', click: actions.checkUpdate },
        { label: '设置', click: actions.openSettings },
        { type: 'separator' },
        { label: '退出 XTodoY', accelerator: 'Ctrl+Q', click: actions.quit },
      ]),
    );
  };
  rebuild();
  refreshMenu = rebuild;
  nativeTheme.on('updated', () => tray?.setImage(icon()));
  app.on('before-quit', () => tray?.destroy());
  return tray;
}

/** 暂停中显示"恢复提醒（暂停至 …）"，否则显示暂停子菜单（FR-BG-06） */
function pausedItem(actions: TrayActions): Electron.MenuItemConstructorOptions {
  const until = actions.pausedUntil();
  if (until && until > Date.now()) {
    const d = new Date(until);
    const label = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
    return { label: `恢复提醒（已暂停至 ${label}）`, click: actions.resumeReminders };
  }
  return {
    label: '暂停提醒',
    submenu: [
      { label: '暂停 1 小时', click: () => actions.pauseReminders('hour') },
      { label: '暂停到明天 0:00', click: () => actions.pauseReminders('tomorrow') },
    ],
  };
}

export function updateTrayCount(c: TodayCount): void {
  tray?.setToolTip(`XTodoY · 今日待办 ${c.open} 项`);
}
