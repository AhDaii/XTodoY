import { useCallback, useEffect, useRef, useState } from 'react';
import type { Settings, TagNode, TodoGroup, ViewCounts } from '@shared/types';
import { api, call } from './api';
import { useUi, type Route } from './store';

/**
 * 订阅主进程数据变化：事件到达时重新拉取（数据量小，整体刷新最简单可靠）。
 * key 变化时重新加载（例如切换视图）；load 通过 ref 读取最新闭包。
 */
function useLive<T>(load: () => Promise<T>, initial: T, events: ((cb: () => void) => () => void)[], key = ''): T {
  const [data, setData] = useState<T>(initial);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });
  useEffect(() => {
    let alive = true;
    const reload = () => void loadRef.current().then((d) => alive && setData(d), console.error);
    reload();
    const offs = events.map((on) => on(reload));
    return () => {
      alive = false;
      offs.forEach((off) => off());
    };
    // events 为模块级常量函数，不会变化
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return data;
}

export function useCounts(): ViewCounts {
  return useLive(() => call(api.todos.counts()), { today: 0, plan: 0, all: 0, done: 0, trash: 0, overdue: 0 }, [
    api.on.todosChanged,
  ]);
}

export function useTagTree(): TagNode[] {
  return useLive(() => call(api.tags.tree()), [], [api.on.tagsChanged, api.on.todosChanged]);
}

export function useGroups(route: Route, search: string, includeChildren: boolean): TodoGroup[] | null {
  const key = JSON.stringify([route, search, includeChildren]);
  return useLive<TodoGroup[] | null>(
    () => {
      if (search) return call(api.todos.list({ search }));
      if (route.kind === 'tag') return call(api.todos.list({ tagId: route.tagId, includeChildren }));
      if (route.kind === 'view') return call(api.todos.list({ view: route.view }));
      return Promise.resolve([]);
    },
    null,
    [api.on.todosChanged, api.on.tagsChanged],
    key,
  );
}

export function useSettings(): Settings | null {
  return useLive<Settings | null>(() => call(api.settings.get()), null, [api.on.settingsChanged]);
}

/** 统一的错误提示：业务错误直接展示主进程给出的中文说明 */
export function useReportError(): (e: unknown) => void {
  const showToast = useUi((s) => s.showToast);
  return useCallback((e: unknown) => showToast(e instanceof Error ? e.message : '操作失败，请重试'), [showToast]);
}
