import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { Events, Invoke, Send, type FloatingApi, type TodayCount } from '@shared/ipc';

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T): void => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

// 悬浮窗只拿到最小权限：读今日计数、打开主窗口、拖动、右键菜单
const api: FloatingApi = {
  getToday: () => ipcRenderer.invoke(Invoke.todayGet),
  openMain: () => ipcRenderer.send(Send.floatingOpenMain),
  moveBy: (dx, dy) => ipcRenderer.send(Send.floatingMoveBy, dx, dy),
  dragEnd: () => ipcRenderer.send(Send.floatingDragEnd),
  showMenu: () => ipcRenderer.send(Send.floatingMenu),
  onTodayCount: (cb) => subscribe<TodayCount>(Events.todayCount, cb),
  onThemeChanged: (cb) => subscribe<{ dark: boolean }>(Events.themeChanged, cb),
};

contextBridge.exposeInMainWorld('xtodoy', api);
