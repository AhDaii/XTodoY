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
  trashDays: 30,
  undoMs: 5000,
} as const;

export interface TagRef {
  id: string;
  name: string;
  color: TagColor;
  path: string; // 显示用完整路径："工作 / 项目A / 设计"
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
  sidebarCollapsed: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  weekStart: 1,
  closeAction: 'tray',
  floatingEnabled: true,
  floatingPos: null,
  sidebarCollapsed: false,
};
