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
};
