import { app, ipcMain, Menu, nativeTheme, type IpcMainInvokeEvent } from 'electron';
import { Events, Invoke, Send, type AppInfo, type NavRequest, type Result } from '@shared/ipc';
import type { StatsPeriodKind } from '@shared/stats';
import { LIMITS, type ListQuery, type Settings, type SmartView } from '@shared/types';
import { bus } from '../events/bus';
import { AppError, invalid } from '../services/errors';
import type { SettingsService } from '../services/settings';
import type { StatsService } from '../services/stats';
import type { TagService } from '../services/tags';
import type { TodayService } from '../services/today';
import type { TodoService } from '../services/todos';
import type { Scheduler } from '../services/scheduler';
import * as v from '../services/validate';
import { showReminder } from '../platform/notifier';
import { destroyFloatingWindow, floatingPosition, moveFloatingBy, showMainWindow, windows } from '../platform/windows';

interface Deps {
  todos: TodoService;
  tags: TagService;
  settings: SettingsService;
  stats: StatsService;
  today: TodayService;
  scheduler: Scheduler;
  dataDir: string;
  schemaVersion: number;
  hardwareAcceleration: boolean;
}

const VIEWS: readonly SmartView[] = ['today', 'plan', 'all', 'done', 'trash'];

/** 注册 invoke 处理器：统一转成 Result，业务错误带 code 与中文说明，未知错误记录日志 */
function handle(channel: string, fn: (...args: unknown[]) => unknown): void {
  ipcMain.handle(channel, async (_e: IpcMainInvokeEvent, ...args: unknown[]): Promise<Result<unknown>> => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (e) {
      if (e instanceof AppError) return { ok: false, error: { code: e.code, message: e.message } };
      console.error(`[ipc] ${channel} failed`, e);
      return { ok: false, error: { code: 'INTERNAL', message: '操作失败，请重试' } };
    }
  });
}

function listQuery(q: unknown): ListQuery {
  const o = v.obj(q ?? {}, ['view', 'tagId', 'includeChildren', 'search']);
  if (o.view !== undefined && !VIEWS.includes(o.view as SmartView)) throw invalid('视图不正确');
  if (o.includeChildren !== undefined && typeof o.includeChildren !== 'boolean') throw invalid('参数格式不正确');
  const search = o.search === undefined ? undefined : v.str(o.search, '搜索词', { max: 100 });
  return {
    view: o.view as SmartView | undefined,
    tagId: o.tagId === undefined ? undefined : v.id(o.tagId, '标签'),
    includeChildren: o.includeChildren as boolean | undefined,
    search: search || undefined,
  };
}

export function registerIpc(d: Deps): void {
  handle(Invoke.appInfo, (): AppInfo => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: `${process.platform} ${process.arch}`,
    dataDir: d.dataDir,
    dbSchemaVersion: d.schemaVersion,
    hardwareAcceleration: d.hardwareAcceleration,
  }));
  handle(Invoke.relaunch, () => {
    app.relaunch();
    app.quit();
  });
  handle(Invoke.todayGet, () => d.today.current);

  // ---- 统计 ----
  handle(Invoke.statsGet, (q) => {
    const o = v.obj(q, ['period', 'offset', 'tagId']);
    if (!['day', 'week', 'month'].includes(o.period as string)) throw invalid('统计维度不正确');
    if (!Number.isInteger(o.offset) || (o.offset as number) > 0 || (o.offset as number) < -1200)
      throw invalid('统计周期不正确');
    return d.stats.get({
      period: o.period as StatsPeriodKind,
      offset: o.offset as number,
      tagId: o.tagId === undefined || o.tagId === null ? undefined : v.id(o.tagId, '标签'),
    });
  });

  // ---- 待办 ----
  handle(Invoke.todoList, (q) => d.todos.list(listQuery(q)));
  handle(Invoke.todoCounts, () => d.todos.counts());
  handle(Invoke.todoGet, (id) => d.todos.get(v.id(id)));
  handle(Invoke.todoCreate, (input) => {
    const o = v.obj(input, ['title', 'dueDate', 'dueTime', 'tagIds', 'priority']);
    return d.todos.create({
      title: v.title(o.title),
      dueDate: v.date(o.dueDate),
      dueTime: v.time(o.dueTime),
      tagIds: o.tagIds === undefined ? [] : v.idList(o.tagIds, '标签', LIMITS.tagsPerTodo),
      priority: o.priority === undefined ? 0 : v.priority(o.priority),
    });
  });
  handle(Invoke.todoUpdate, (id, patch) => {
    const o = v.obj(patch, ['title', 'note', 'dueDate', 'dueTime', 'priority']);
    return d.todos.update(v.id(id), {
      ...(o.title !== undefined && { title: v.title(o.title) }),
      ...(o.note !== undefined && { note: v.note(o.note) }),
      ...('dueDate' in o && { dueDate: v.date(o.dueDate) }),
      ...('dueTime' in o && { dueTime: v.time(o.dueTime) }),
      ...(o.priority !== undefined && { priority: v.priority(o.priority) }),
    });
  });
  handle(Invoke.todoToggle, (id) => d.todos.toggle(v.id(id)));
  handle(Invoke.todoUndo, (token) => d.todos.undo(v.id(token, '撤销令牌')));
  handle(Invoke.todoDelete, (id) => d.todos.remove(v.id(id)));
  handle(Invoke.todoRestore, (id) => d.todos.restore(v.id(id)));
  handle(Invoke.todoPurge, (id) => d.todos.purge(v.id(id)));
  handle(Invoke.todoPurgeAll, () => d.todos.purgeAll());
  handle(Invoke.todoReorder, (id, afterId, beforeId) => d.todos.reorder(v.id(id), v.optId(afterId), v.optId(beforeId)));
  handle(Invoke.todoSetTags, (id, tagIds) => d.todos.setTags(v.id(id), v.idList(tagIds, '标签', LIMITS.tagsPerTodo)));
  handle(Invoke.todoSetRepeat, (id, rule) => d.todos.setRepeat(v.id(id), v.repeatRule(rule)));
  handle(Invoke.todoSkip, (id) => d.todos.skip(v.id(id)));
  handle(Invoke.todoSetReminders, (id, list) => d.todos.setReminders(v.id(id), v.reminderList(list)));
  handle(Invoke.remindersPause, (kind) => {
    if (kind === null) return d.settings.set('pausedUntil', null);
    if (kind !== 'hour' && kind !== 'tomorrow') throw invalid('暂停方式不正确');
    const now = new Date();
    const until =
      kind === 'hour'
        ? now.getTime() + 3_600_000
        : new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
    return d.settings.set('pausedUntil', until);
  });

  // ---- 标签 ----
  handle(Invoke.tagTree, () => d.tags.tree());
  handle(Invoke.tagCreate, (input) => {
    const o = v.obj(input, ['name', 'parentId', 'color']);
    return d.tags.create({
      name: v.tagName(o.name),
      parentId: v.optId(o.parentId, '父标签'),
      ...(o.color !== undefined && { color: v.color(o.color) }),
    });
  });
  handle(Invoke.tagUpdate, (id, patch) => {
    const o = v.obj(patch, ['name', 'color']);
    return d.tags.update(v.id(id), {
      ...(o.name !== undefined && { name: v.tagName(o.name) }),
      ...(o.color !== undefined && { color: v.color(o.color) }),
    });
  });
  handle(Invoke.tagMove, (id, parentId, afterId, beforeId) =>
    d.tags.move(v.id(id), v.optId(parentId, '父标签'), v.optId(beforeId), v.optId(afterId)),
  );
  handle(Invoke.tagDelete, (id, children) => {
    if (children !== 'promote' && children !== 'delete') throw invalid('子标签处理方式不正确');
    return d.tags.delete(v.id(id), children);
  });
  handle(Invoke.tagMerge, (fromId, toId) => d.tags.merge(v.id(fromId), v.id(toId)));

  // ---- 设置 ----
  handle(Invoke.settingsGet, () => d.settings.get());
  handle(Invoke.settingsSet, (key, value) =>
    d.settings.set(v.str(key, '设置项', { min: 1, max: 40 }) as keyof Settings, value),
  );

  // ---- 系统：测试通知（FR-REM-04 人工验证用） ----
  handle(Invoke.testNotify, () => {
    showReminder(
      { todoId: 'test', title: 'XTodoY 测试通知', body: '点击「完成」或「稍后提醒」验证按钮回调' },
      {
        open: () => showMainWindow(),
        complete: (id) => console.log('[notify] complete', id),
        snooze: (id) => console.log('[notify] snooze', id),
      },
      { snoozeMinutes: d.settings.get().snoozeMinutes, sound: d.settings.get().reminderSound },
    );
  });

  // ---- 悬浮窗 ----
  const openMainAt = (nav: NavRequest): void => {
    const win = showMainWindow();
    const send = (): void => win.webContents.send(Events.navOpen, nav);
    if (win.webContents.isLoading()) win.webContents.once('did-finish-load', send);
    else send();
  };
  ipcMain.on(Send.floatingOpenMain, () => openMainAt({ view: 'today' }));
  ipcMain.on(Send.floatingMoveBy, (_e, dx: unknown, dy: unknown) => {
    if (typeof dx === 'number' && typeof dy === 'number' && Number.isFinite(dx) && Number.isFinite(dy)) {
      moveFloatingBy(dx, dy);
    }
  });
  ipcMain.on(Send.floatingDragEnd, () => {
    const p = floatingPosition();
    if (p) d.settings.set('floatingPos', p);
  });
  // 悬浮窗右键菜单（FR-FLT-05）
  ipcMain.on(Send.floatingMenu, () => {
    const st = d.settings.get();
    Menu.buildFromTemplate([
      { label: '新建待办', click: () => openMainAt({ view: 'today', focus: 'quick-add' }) },
      { label: '打开主窗口', click: () => openMainAt({ view: 'today' }) },
      { type: 'separator' },
      {
        label: '锁定位置',
        type: 'checkbox',
        checked: st.floatingLocked,
        click: () => d.settings.set('floatingLocked', !st.floatingLocked),
      },
      {
        label: '透明度',
        submenu: ([100, 80, 60] as const).map((o) => ({
          label: `${o}%`,
          type: 'radio' as const,
          checked: st.floatingOpacity === o,
          click: () => d.settings.set('floatingOpacity', o),
        })),
      },
      { type: 'separator' },
      { label: '隐藏悬浮窗', click: () => d.settings.set('floatingEnabled', false) },
    ]).popup({ window: windows.floating ?? undefined });
  });

  // ---- 主进程事件 → 渲染进程 ----
  const broadcast = (channel: string, payload?: unknown): void =>
    windows.all().forEach((w) => w.webContents.send(channel, payload));
  bus.on('todos.changed', () => broadcast(Events.todosChanged));
  bus.on('tags.changed', () => broadcast(Events.tagsChanged));
  bus.on('today.count', (c) => broadcast(Events.todayCount, c));
  bus.on('settings.changed', (patch) => {
    broadcast(Events.settingsChanged, patch);
    if (patch.theme) {
      nativeTheme.themeSource = patch.theme;
      broadcast(Events.themeChanged, { dark: nativeTheme.shouldUseDarkColors });
    }
    if (patch.floatingEnabled === false) destroyFloatingWindow();
  });
  nativeTheme.on('updated', () => {
    const dark = nativeTheme.shouldUseDarkColors;
    bus.emit('theme.changed', dark);
    broadcast(Events.themeChanged, { dark });
  });
}
