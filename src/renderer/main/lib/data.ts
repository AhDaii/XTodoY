import { presetImageUrl } from '@shared/background';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Settings, TagNode, TodoGroup, ViewCounts } from '@shared/types';
import type { Stats, StatsQuery } from '@shared/stats';
import type { UpdateStatus } from '@shared/update';
import { api, call } from './api';
import { useUi, type Route } from './store';

/**
 * 订阅主进程数据变化：事件到达时重新拉取（数据量小，整体刷新最简单可靠）。
 * key 变化时重新加载（例如切换视图）；load 通过 ref 读取最新闭包。
 * 只返回属于当前 key 的数据：切换后、新数据到达前返回 initial。之前会继续返回上一个视图的数据，
 * 形状不同（如回收站只有 1 个分组、今天有 2 个）时页面读取越界、整个界面变为空白（rc.1 反馈）。
 */
function useLive<T>(load: () => Promise<T>, initial: T, events: ((cb: () => void) => () => void)[], key = ''): T {
  const [state, setState] = useState<{ key: string; data: T }>({ key, data: initial });
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });
  useEffect(() => {
    let alive = true;
    const reload = () => void loadRef.current().then((data) => alive && setState({ key, data }), console.error);
    reload();
    const offs = events.map((on) => on(reload));
    return () => {
      alive = false;
      offs.forEach((off) => off());
    };
    // events 为模块级常量函数，不会变化
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state.key === key ? state.data : initial;
}

export function useCounts(): ViewCounts {
  return useLive(() => call(api.todos.counts()), { today: 0, plan: 0, all: 0, done: 0, trash: 0, overdue: 0 }, [
    api.on.todosChanged,
  ]);
}

export function useTagTree(): TagNode[] {
  return useLive(() => call(api.tags.tree()), [], [api.on.tagsChanged, api.on.todosChanged]);
}

export function useGroups(
  route: Route,
  search: string,
  includeChildren: boolean,
  showDone = false,
): TodoGroup[] | null {
  const key = JSON.stringify([route, search, includeChildren, showDone]);
  return useLive<TodoGroup[] | null>(
    () => {
      if (search) return call(api.todos.list({ search }));
      if (route.kind === 'tag') return call(api.todos.list({ tagId: route.tagId, includeChildren, showDone }));
      if (route.kind === 'view') return call(api.todos.list({ view: route.view }));
      return Promise.resolve([]);
    },
    null,
    // 设置变化时也刷新：排序方式与周起始日影响列表
    [api.on.todosChanged, api.on.tagsChanged, api.on.settingsChanged],
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

/** 统计页数据：事项、标签或设置（周起始日）变化后自动刷新 */
export function useStats(q: StatsQuery): Stats | null {
  return useLive<Stats | null>(
    () => call(api.stats(q)),
    null,
    [api.on.todosChanged, api.on.tagsChanged, api.on.settingsChanged],
    JSON.stringify(q),
  );
}

/** 更新状态：初次拉取，之后由主进程推送 update:status */
export function useUpdateStatus(): UpdateStatus | null {
  const [s, setS] = useState<UpdateStatus | null>(null);
  useEffect(() => {
    let alive = true;
    void call(api.update.status()).then((x) => alive && setS(x), console.error);
    const off = api.on.updateStatus(setS);
    return () => {
      alive = false;
      off();
    };
  }, []);
  return s;
}

/** 系统通知是否被关闭（FR-REM-09）：打开时与窗口重新获得焦点时检查（用户可能刚去系统设置里改过） */
export function useNotificationStatus(): 'allowed' | 'denied' | 'unknown' | null {
  const [s, setS] = useState<'allowed' | 'denied' | 'unknown' | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => void call(api.notificationStatus()).then((x) => alive && setS(x), console.error);
    load();
    window.addEventListener('focus', load);
    return () => {
      alive = false;
      window.removeEventListener('focus', load);
    };
  }, []);
  return s;
}

/**
 * 背景图地址（#41）：内置背景直接生成 data URL；上传的图片向主进程读取（按文件名缓存，换图时文件名会变）。
 * 返回 CSS 的 url(...)，无背景或读取失败时为 null。
 */
export function useBackgroundUrl(image: string | null | undefined): string | null {
  const kind = image?.slice(0, image.indexOf(':'));
  const ref = image?.slice(image.indexOf(':') + 1) ?? '';
  const custom = useLive<string | null>(
    () => (kind === 'custom' ? call(api.background.load(ref)) : Promise.resolve(null)),
    null,
    [],
    kind === 'custom' ? ref : '',
  );
  if (kind === 'preset') return presetImageUrl(ref);
  return kind === 'custom' && custom ? `url("${custom}")` : null;
}

/** 已公布放假安排的年份（升序，#46）：联网更新后随 holidays:changed 刷新 */
export function useHolidayYears(): number[] {
  return useLive(
    () =>
      call(api.holidays.get()).then((list) =>
        list
          .filter((y) => y.days.length)
          .map((y) => y.year)
          .sort((a, b) => a - b),
      ),
    [],
    [api.on.holidaysChanged],
  );
}
