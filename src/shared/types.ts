import type { ReleaseNote } from './update';
// 主进程与渲染进程共用的领域类型

export type Priority = 0 | 1 | 2 | 3; // 无 / 低 / 中 / 高
export type TodoStatus = 'open' | 'done';
export type SmartView = 'today' | 'plan' | 'all' | 'done' | 'trash';

export const TAG_COLORS = [
  'teal',
  'blue',
  'indigo',
  'violet',
  'pink',
  'red',
  'orange',
  'amber',
  'lime',
  'green',
  'cyan',
  'slate',
] as const;
export type TagColor = (typeof TAG_COLORS)[number];

export const LIMITS = {
  titleMax: 200,
  noteMax: 5000,
  tagNameMax: 30,
  tagDepthMax: 5, // 最多 5 级（D-6）
  tagsPerTodo: 10,
  remindersPerTodo: 5,
  trashDays: 30,
  undoMs: 5000,
} as const;

export interface TagRef {
  id: string;
  name: string;
  color: TagColor;
  path: string; // 显示用完整路径："工作 / 项目A / 设计"
}

/** 提醒规则：相对截止时间提前若干分钟，或绝对时刻（FR-REM-01） */
export type ReminderSpec = { kind: 'relative'; offsetMinutes: number } | { kind: 'absolute'; at: number };

export interface Reminder {
  id: string;
  spec: ReminderSpec;
  /** 下一次触发时刻；已触发或无效时为 null */
  nextFireAt: number | null;
}

export interface Todo {
  id: string;
  title: string;
  note: string;
  dueDate: string | null; // YYYY-MM-DD
  dueTime: string | null; // HH:mm；null 表示全天
  priority: Priority;
  status: TodoStatus;
  completedAt: number | null;
  sortKey: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  tags: TagRef[];
  /** RFC 5545 RRULE 子集；null 表示不循环（见 shared/recurrence.ts） */
  rrule: string | null;
  /** 循环的首次实例日期，用于"每 N 周 / 月"的间隔计算 */
  repeatAnchor: string | null;
  repeatCountDone: number;
  reminders: Reminder[];
}

/** 列表排序方式（FR-TODO-06）；截止时间 = 日期 → 时间 → 优先级 → 手动顺序 */
export type SortMode = 'due' | 'manual' | 'priority' | 'created' | 'title';
/** 各自记忆排序方式的列表：三个智能视图与标签列表（已完成 / 回收站 / 搜索结果顺序固定） */
export type SortScope = 'today' | 'plan' | 'all' | 'tag';
export const SORT_MODES: readonly SortMode[] = ['due', 'manual', 'priority', 'created', 'title'];

export interface TodoGroup {
  id: string;
  title: string | null;
  tone?: 'overdue';
  collapsible?: boolean;
  items: Todo[];
}

export interface ListQuery {
  view?: SmartView;
  tagId?: string;
  includeChildren?: boolean;
  /** 标签视图同时列出已完成的事项（FR-TAG-04） */
  showDone?: boolean;
  search?: string;
}

export interface ViewCounts {
  today: number;
  plan: number;
  all: number;
  done: number;
  trash: number;
  overdue: number;
}

export interface TagNode {
  id: string;
  parentId: string | null;
  name: string;
  color: TagColor;
  depth: number;
  path: string; // 物化路径 /id/id/
  displayPath: string;
  openCount: number; // 含子标签的未完成事项数
  todoCount: number; // 直接挂在该标签上的事项数（含已完成）
}

export interface TodoCreate {
  title: string;
  dueDate?: string | null;
  dueTime?: string | null;
  tagIds?: string[];
  priority?: Priority;
}

export interface TodoPatch {
  title?: string;
  note?: string;
  dueDate?: string | null;
  dueTime?: string | null;
  priority?: Priority;
}

export interface Settings {
  theme: 'light' | 'dark' | 'system';
  weekStart: 0 | 1;
  closeAction: 'tray' | 'quit';
  floatingEnabled: boolean;
  floatingPos: { x: number; y: number } | null;
  floatingOpacity: 100 | 80 | 60;
  floatingLocked: boolean;
  sidebarCollapsed: boolean;
  autostart: boolean;
  /** 新建带时间的事项时自动添加的提醒，-1 表示不添加（FR-REM-02） */
  defaultReminder: -1 | 0 | 5 | 15 | 30 | 60;
  /** 全天事项"准时"提醒的时间（FR-SET-04，D-9） */
  allDayTime: string;
  snoozeMinutes: 5 | 10 | 15 | 30 | 60;
  reminderSound: boolean;
  /** 暂停提醒到该时刻（毫秒），null 表示未暂停（FR-BG-06） */
  pausedUntil: number | null;
  closeTipShown: boolean;
  /** 硬件加速（默认关闭以降低常驻内存），重启后生效 */
  hardwareAcceleration: boolean;
  /** 全局快捷键：在任意程序中打开主窗口并聚焦快速新建（FR-SET-08），null 为关闭 */
  quickAddShortcut: string | null;
  /** 每周联网更新法定节假日数据（holiday-cn） */
  holidayAutoUpdate: boolean;
  holidayCheckedAt: number | null;
  listSort: Record<SortScope, SortMode>;
  /** 更新（FR-UPD-08） */
  autoCheckUpdate: boolean;
  /** 发现新版本时保存的更新说明：更新后首次启动的"查看更新内容"使用（#25） */
  updateNotes: { version: string; releaseDate: string; notes: ReleaseNote[] } | null;
  autoDownloadUpdate: boolean;
  updateChannel: 'stable' | 'beta';
  /** 更新状态（DR-07）：上次检查、跳过的版本、已通知的版本、上次运行的版本与更新后横幅 */
  update: {
    lastCheckAt: number | null;
    skipped: string | null;
    notifiedAvailable: string | null;
    notifiedReady: string | null;
    lastRunVersion: string | null;
    banner: string | null;
  };
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  weekStart: 1,
  closeAction: 'tray',
  floatingEnabled: true,
  floatingPos: null,
  floatingOpacity: 100,
  floatingLocked: false,
  sidebarCollapsed: false,
  autostart: false,
  defaultReminder: 0,
  allDayTime: '08:30',
  snoozeMinutes: 10,
  reminderSound: true,
  pausedUntil: null,
  closeTipShown: false,
  hardwareAcceleration: false,
  quickAddShortcut: 'Ctrl+Alt+T',
  holidayAutoUpdate: true,
  holidayCheckedAt: null,
  listSort: { today: 'due', plan: 'due', all: 'due', tag: 'due' },
  autoCheckUpdate: true,
  updateNotes: null,
  autoDownloadUpdate: true,
  updateChannel: 'stable',
  update: {
    lastCheckAt: null,
    skipped: null,
    notifiedAvailable: null,
    notifiedReady: null,
    lastRunVersion: null,
    banner: null,
  },
};
