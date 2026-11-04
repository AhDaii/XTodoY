import { create } from 'zustand';
import type { SmartView } from '@shared/types';

export type Route =
  | { kind: 'view'; view: SmartView }
  | { kind: 'tag'; tagId: string }
  | { kind: 'page'; page: 'tags' | 'settings' | 'stats' };

export interface ToastState {
  id: number;
  message: string;
  undo?: () => void;
}

interface UiState {
  route: Route;
  selectedId: string | null;
  search: string;
  includeChildren: boolean;
  /** 标签视图显示已完成（FR-TAG-04） */
  showDoneInTag: boolean;
  collapsedGroups: Set<string>;
  collapsedTags: Set<string>;
  toast: ToastState | null;
  /** 正在播放"完成"动画、尚未提交的事项（#24：动画结束后再保存，否则今天视图中该行会立即移走） */
  completing: Set<string>;
  setCompleting(id: string, on: boolean): void;
  /** 更新详情对话框、正在安装遮罩（SRS F10） */
  updateDialog: boolean;
  installing: boolean;
  setUpdateDialog(v: boolean): void;
  setInstalling(v: boolean): void;
  go(route: Route): void;
  select(id: string | null): void;
  setSearch(q: string): void;
  setIncludeChildren(v: boolean): void;
  setShowDoneInTag(v: boolean): void;
  toggleGroup(id: string): void;
  toggleTag(id: string): void;
  showToast(message: string, undo?: () => void): void;
  hideToast(): void;
}

const toggleIn = (set: Set<string>, id: string): Set<string> => {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
};

let toastSeq = 0;

/** 界面状态（视图、选中项、折叠状态、提示条）；业务数据以主进程为准，不放在这里 */
export const useUi = create<UiState>((set) => ({
  route: { kind: 'view', view: 'today' },
  selectedId: null,
  search: '',
  includeChildren: true,
  showDoneInTag: false,
  collapsedGroups: new Set(['today-done']),
  collapsedTags: new Set(),
  toast: null,
  completing: new Set(),
  setCompleting: (id, on) =>
    set((s) => {
      const next = new Set(s.completing);
      if (on) next.add(id);
      else next.delete(id);
      return { completing: next };
    }),
  updateDialog: false,
  installing: false,
  setUpdateDialog: (updateDialog) => set({ updateDialog }),
  setInstalling: (installing) => set({ installing }),
  go: (route) => set({ route, selectedId: null, search: '' }),
  select: (selectedId) => set({ selectedId }),
  setSearch: (search) => set({ search, selectedId: null }),
  setIncludeChildren: (includeChildren) => set({ includeChildren }),
  setShowDoneInTag: (showDoneInTag) => set({ showDoneInTag }),
  toggleGroup: (id) => set((s) => ({ collapsedGroups: toggleIn(s.collapsedGroups, id) })),
  toggleTag: (id) => set((s) => ({ collapsedTags: toggleIn(s.collapsedTags, id) })),
  showToast: (message, undo) => set({ toast: { id: ++toastSeq, message, undo } }),
  hideToast: () => set({ toast: null }),
}));
