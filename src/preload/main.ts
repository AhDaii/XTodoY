import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { Channels, type TodayCount, type XtodoyApi } from '@shared/ipc';

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T): void => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: XtodoyApi = {
  appInfo: () => ipcRenderer.invoke(Channels.appInfo),
  getToday: () => ipcRenderer.invoke(Channels.todayGet),
  setTheme: (theme) => ipcRenderer.invoke(Channels.settingsSetTheme, theme),
  spikeNotify: () => ipcRenderer.invoke(Channels.spikeNotify),
  spikeAddTodo: (title) => ipcRenderer.invoke(Channels.spikeAddTodo, title),
  onTodayCount: (cb) => subscribe<TodayCount>(Channels.todayCount, cb),
  onThemeChanged: (cb) => subscribe<{ dark: boolean }>(Channels.themeChanged, cb),
};

contextBridge.exposeInMainWorld('xtodoy', api);
