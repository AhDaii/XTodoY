import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { Channels, type FloatingApi, type TodayCount } from '@shared/ipc';

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T): void => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

// 悬浮窗只拿到最小权限：读今日计数、打开主窗口、拖动、右键菜单
const api: FloatingApi = {
  getToday: () => ipcRenderer.invoke(Channels.todayGet),
  openMain: () => ipcRenderer.send(Channels.floatingOpenMain),
  moveBy: (dx, dy) => ipcRenderer.send(Channels.floatingMoveBy, dx, dy),
  dragEnd: () => ipcRenderer.send(Channels.floatingDragEnd),
  showMenu: () => ipcRenderer.send(Channels.floatingMenu),
  onTodayCount: (cb) => subscribe<TodayCount>(Channels.todayCount, cb),
  onThemeChanged: (cb) => subscribe<{ dark: boolean }>(Channels.themeChanged, cb),
};

contextBridge.exposeInMainWorld('xtodoy', api);
