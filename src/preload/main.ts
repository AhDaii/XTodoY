import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { Events, Invoke, type XtodoyApi } from '@shared/ipc';

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T): void => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const call = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args);

const api: XtodoyApi = {
  appInfo: () => call(Invoke.appInfo),
  getToday: () => call(Invoke.todayGet),
  todos: {
    list: (q) => call(Invoke.todoList, q),
    counts: () => call(Invoke.todoCounts),
    get: (id) => call(Invoke.todoGet, id),
    create: (input) => call(Invoke.todoCreate, input),
    update: (id, patch) => call(Invoke.todoUpdate, id, patch),
    toggle: (id) => call(Invoke.todoToggle, id),
    undo: (token) => call(Invoke.todoUndo, token),
    remove: (id) => call(Invoke.todoDelete, id),
    restore: (id) => call(Invoke.todoRestore, id),
    purge: (id) => call(Invoke.todoPurge, id),
    purgeAll: () => call(Invoke.todoPurgeAll),
    reorder: (id, afterId, beforeId) => call(Invoke.todoReorder, id, afterId, beforeId),
    setTags: (id, tagIds) => call(Invoke.todoSetTags, id, tagIds),
    setRepeat: (id, rule) => call(Invoke.todoSetRepeat, id, rule),
    skip: (id) => call(Invoke.todoSkip, id),
    setReminders: (id, reminders) => call(Invoke.todoSetReminders, id, reminders),
  },
  pauseReminders: (kind) => call(Invoke.remindersPause, kind),
  tags: {
    tree: () => call(Invoke.tagTree),
    create: (input) => call(Invoke.tagCreate, input),
    update: (id, patch) => call(Invoke.tagUpdate, id, patch),
    move: (id, parentId, afterId = null, beforeId = null) => call(Invoke.tagMove, id, parentId, afterId, beforeId),
    remove: (id, children) => call(Invoke.tagDelete, id, children),
    merge: (fromId, toId) => call(Invoke.tagMerge, fromId, toId),
  },
  settings: {
    get: () => call(Invoke.settingsGet),
    set: (key, value) => call(Invoke.settingsSet, key, value),
  },
  testNotify: () => call(Invoke.testNotify),
  relaunch: () => call(Invoke.relaunch),
  stats: (q) => call(Invoke.statsGet, q),
  data: {
    info: () => call(Invoke.dataInfo),
    exportJson: () => call(Invoke.dataExport),
    importJson: () => call(Invoke.dataImport),
    openFolder: () => call(Invoke.dataOpenFolder),
  },
  on: {
    todosChanged: (cb) => subscribe(Events.todosChanged, cb),
    tagsChanged: (cb) => subscribe(Events.tagsChanged, cb),
    settingsChanged: (cb) => subscribe(Events.settingsChanged, cb),
    todayCount: (cb) => subscribe(Events.todayCount, cb),
    themeChanged: (cb) => subscribe(Events.themeChanged, cb),
    navOpen: (cb) => subscribe(Events.navOpen, cb),
  },
};

contextBridge.exposeInMainWorld('xtodoy', api);
