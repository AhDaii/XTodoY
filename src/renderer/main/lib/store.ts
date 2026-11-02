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
  sidebarCollapsed: boolean;
  collapsedGroups: Set<string>;
  collapsedTags: Set<string>;
  toast: ToastState | null;
  go(route: Route): void;
  select(id: string | null): void;
  setSearch(q: string): void;
  setIncludeChildren(v: boolean): void;
  toggleSidebar(): void;
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
  sidebarCollapsed: false,
  collapsedGroups: new Set(['today-done']),
  collapsedTags: new Set(),
  toast: null,
  go: (route) => set({ route, selectedId: null, search: '' }),
  select: (selectedId) => set({ selectedId }),
  setSearch: (search) => set({ search, selectedId: null }),
  setIncludeChildren: (includeChildren) => set({ includeChildren }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  toggleGroup: (id) => set((s) => ({ collapsedGroups: toggleIn(s.collapsedGroups, id) })),
  toggleTag: (id) => set((s) => ({ collapsedTags: toggleIn(s.collapsedTags, id) })),
  showToast: (message, undo) => set({ toast: { id: ++toastSeq, message, undo } }),
  hideToast: () => set({ toast: null }),
}));
