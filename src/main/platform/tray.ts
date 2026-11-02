import { app, Menu, nativeImage, nativeTheme, Tray } from 'electron';
import type { TodayCount } from '@shared/ipc';
import { resourcePath } from '../app/paths';

export interface TrayActions {
  openMain(): void;
  newTodo(): void;
  toggleFloating(): void;
  isFloatingVisible(): boolean;
  pauseReminders(kind: 'hour' | 'tomorrow'): void;
  checkUpdate(): void;
  openSettings(): void;
  quit(): void;
}

let tray: Tray | null = null;

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
        { label: '新建待办', accelerator: 'Ctrl+Alt+T', click: actions.newTodo },
        { label: '显示悬浮窗', type: 'checkbox', checked: actions.isFloatingVisible(), click: actions.toggleFloating },
        {
          label: '暂停提醒',
          submenu: [
            { label: '暂停 1 小时', click: () => actions.pauseReminders('hour') },
            { label: '暂停到明天 0:00', click: () => actions.pauseReminders('tomorrow') },
          ],
        },
        { label: '检查更新', click: actions.checkUpdate },
        { label: '设置', click: actions.openSettings },
        { type: 'separator' },
        { label: '退出 XTodoY', accelerator: 'Ctrl+Q', click: actions.quit },
      ]),
    );
  };
  rebuild();
  // 右键前重建，保证"显示悬浮窗"勾选状态最新
  tray.on('right-click', rebuild);
  nativeTheme.on('updated', () => tray?.setImage(icon()));
  app.on('before-quit', () => tray?.destroy());
  return tray;
}

export function updateTrayCount(c: TodayCount): void {
  tray?.setToolTip(`XTodoY · 今日待办 ${c.open} 项`);
}
