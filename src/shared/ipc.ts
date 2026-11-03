// 主进程与渲染进程共用的 IPC 通道与 API 类型（完整说明见 docs/design/ipc.md）
import type { RepeatRule } from './recurrence';
import type {
  ListQuery,
  ReminderSpec,
  Settings,
  TagColor,
  TagNode,
  Todo,
  TodoCreate,
  TodoGroup,
  TodoPatch,
  ViewCounts,
} from './types';

export type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

export interface TodayCount {
  open: number;
  done: number;
  total: number;
}

export type ThemeSetting = Settings['theme'];

export interface AppInfo {
  version: string;
  electron: string;
  chrome: string;
  node: string;
  platform: string;
  dataDir: string;
  dbSchemaVersion: number;
}

export interface NavRequest {
  view?: 'today' | 'settings';
  todoId?: string;
  /** 打开后聚焦的输入框（托盘 / 悬浮窗"新建待办"） */
  focus?: 'quick-add';
}

/** 请求 / 响应通道（ipcRenderer.invoke），返回值统一为 Result<T> */
export const Invoke = {
  appInfo: 'app:info',
  todayGet: 'today:get',
  todoList: 'todo:list',
  todoCounts: 'todo:counts',
  todoGet: 'todo:get',
  todoCreate: 'todo:create',
  todoUpdate: 'todo:update',
  todoToggle: 'todo:toggle',
  todoUndo: 'todo:undo',
  todoDelete: 'todo:delete',
  todoRestore: 'todo:restore',
  todoPurge: 'todo:purge',
  todoPurgeAll: 'todo:purgeAll',
  todoReorder: 'todo:reorder',
  todoSetTags: 'todo:setTags',
  todoSetRepeat: 'todo:setRepeat',
  todoSkip: 'todo:skip',
  todoSetReminders: 'todo:setReminders',
  remindersPause: 'reminders:pause',
  tagTree: 'tag:tree',
  tagCreate: 'tag:create',
  tagUpdate: 'tag:update',
  tagMove: 'tag:move',
  tagDelete: 'tag:delete',
  tagMerge: 'tag:merge',
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  testNotify: 'system:testNotify',
} as const;

/** 单向消息（ipcRenderer.send），用于悬浮窗 */
export const Send = {
  floatingOpenMain: 'floating:openMain',
  floatingMoveBy: 'floating:moveBy',
  floatingDragEnd: 'floating:dragEnd',
  floatingMenu: 'floating:menu',
} as const;

/** 主进程 → 渲染进程事件 */
export const Events = {
  todosChanged: 'todos:changed',
  tagsChanged: 'tags:changed',
  settingsChanged: 'settings:changed',
  todayCount: 'today:count',
  themeChanged: 'theme:changed',
  navOpen: 'nav:open',
} as const;

type R<T> = Promise<Result<T>>;

/** 主窗口 preload 暴露的 API（window.xtodoy） */
export interface XtodoyApi {
  appInfo(): R<AppInfo>;
  getToday(): R<TodayCount>;
  todos: {
    list(q: ListQuery): R<TodoGroup[]>;
    counts(): R<ViewCounts>;
    get(id: string): R<Todo>;
    create(input: TodoCreate): R<Todo>;
    update(id: string, patch: TodoPatch): R<Todo>;
    toggle(id: string): R<{ todo: Todo; undoToken: string }>;
    undo(token: string): R<void>;
    remove(id: string): R<{ undoToken: string }>;
    restore(id: string): R<void>;
    purge(id: string): R<void>;
    purgeAll(): R<void>;
    reorder(id: string, afterId: string | null, beforeId: string | null): R<void>;
    setTags(id: string, tagIds: string[]): R<Todo>;
    setRepeat(id: string, rule: RepeatRule | null): R<Todo>;
    skip(id: string): R<{ todo: Todo; undoToken: string }>;
    setReminders(id: string, reminders: ReminderSpec[]): R<Todo>;
  };
  /** 暂停提醒：1 小时 / 到明天 0:00；null 为恢复（FR-BG-06） */
  pauseReminders(kind: 'hour' | 'tomorrow' | null): R<Settings>;
  tags: {
    tree(): R<TagNode[]>;
    create(input: { name: string; parentId: string | null; color?: TagColor }): R<TagNode>;
    update(id: string, patch: { name?: string; color?: TagColor }): R<void>;
    move(id: string, parentId: string | null, afterId?: string | null, beforeId?: string | null): R<void>;
    remove(id: string, children: 'promote' | 'delete'): R<void>;
    merge(fromId: string, toId: string): R<void>;
  };
  settings: {
    get(): R<Settings>;
    set<K extends keyof Settings>(key: K, value: Settings[K]): R<Settings>;
  };
  testNotify(): R<void>;
  on: {
    todosChanged(cb: () => void): () => void;
    tagsChanged(cb: () => void): () => void;
    settingsChanged(cb: (s: Partial<Settings>) => void): () => void;
    todayCount(cb: (c: TodayCount) => void): () => void;
    themeChanged(cb: (p: { dark: boolean }) => void): () => void;
    navOpen(cb: (n: NavRequest) => void): () => void;
  };
}

/** 悬浮窗 preload 暴露的最小 API（window.xtodoy） */
export interface FloatingApi {
  getToday(): R<TodayCount>;
  openMain(): void;
  moveBy(dx: number, dy: number): void;
  dragEnd(): void;
  showMenu(): void;
  onTodayCount(cb: (c: TodayCount) => void): () => void;
  onThemeChanged(cb: (p: { dark: boolean }) => void): () => void;
}
