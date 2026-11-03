# XTodoY IPC 接口

> 实现：`src/shared/ipc.ts`（类型与通道名，主 / 渲染共用）· `src/preload/*.ts` · `src/main/ipc/`

## 1 约定

- 渲染进程 **只能** 通过 preload 用 `contextBridge` 暴露的 `window.xtodoy` 调用主进程；不暴露 `ipcRenderer` 本身。
- 请求 / 响应：`ipcRenderer.invoke(channel, payload)` ↔ `ipcMain.handle(channel)`。通道名 `域:动作`。
- 事件推送：主进程 `webContents.send(channel, payload)`，preload 提供 `on(event, cb)` 并返回取消订阅函数。
- 返回值统一为 `Result<T> = { ok: true, data: T } | { ok: false, error: { code, message } }`，渲染进程不处理异常对象。
- 主进程对每个 payload 做运行时校验（类型、长度、枚举、未知字段），失败返回 `code: 'INVALID_INPUT'`。
- 两个 preload：主窗口用 `preload/main.ts`（完整 API）；悬浮窗用 `preload/floating.ts`（只读计数 + 打开主窗口），最小权限。

## 2 主窗口 API

### 2.1 待办

| 通道 | 入参 | 返回 | 需求 |
|---|---|---|---|
| `todo:list` | `{ view: 'today'\|'plan'\|'all'\|'done'\|'trash', tagId?, includeChildren?, search? }` | `TodoGroup[]` | FR-TODO-05/08, FR-TAG-03 |
| `todo:get` | `{ id }` | `TodoDetail` | FR-TODO-02 |
| `todo:create` | `{ title, dueDate?, tagIds?, … }` | `TodoDetail` | FR-TODO-01 |
| `todo:update` | `{ id, patch }`（标题、备注、日期、时间、循环、优先级） | `TodoDetail` | FR-TODO-02 |
| `todo:toggle` | `{ id }` | `{ todo, undoToken }` | FR-TODO-03, FR-REC-05 |
| `todo:undo` | `{ undoToken }` | `void` | 撤销完成 / 删除 |
| `todo:skip` | `{ id }` | `TodoDetail` | FR-REC-06 |
| `todo:delete` | `{ id }` | `{ undoToken }` | FR-TODO-04 |
| `todo:restore` / `todo:purge` / `todo:purgeAll` | `{ id }` / `{ id }` / — | `void` | 回收站 |
| `todo:reorder` | `{ id, beforeId?, afterId? }` | `void` | FR-TODO-06 |
| `todo:setTags` | `{ id, tagIds }` | `TodoDetail` | FR-TAG-02 |
| `todo:setReminders` | `{ id, reminders: ReminderInput[] }` | `TodoDetail` | FR-REM-01 |
| `todo:previewOccurrences` | `{ start, rule, count }` | `string[]` | FR-REC-02 预览 |

### 2.2 标签

| 通道 | 入参 | 返回 | 需求 |
|---|---|---|---|
| `tag:tree` | — | `TagNode[]`（含未完成计数） | FR-TAG-03 |
| `tag:create` | `{ name, parentId?, color? }` | `Tag` | FR-TGM-02 |
| `tag:update` | `{ id, name?, color? }` | `Tag` | FR-TGM-02 |
| `tag:move` | `{ id, parentId, beforeId?, afterId? }` | `void` | FR-TGM-03 |
| `tag:delete` | `{ id, children: 'promote'\|'delete' }` | `void` | FR-TGM-04 |
| `tag:merge` | `{ fromId, toId }` | `void` | FR-TGM-05 |

### 2.3 统计

| 通道 | 入参 | 返回 | 需求 |
|---|---|---|---|
| `stats:get` | `{ period: 'day'\|'week'\|'month', offset ≤ 0, tagId? }` | `Stats`（`src/shared/stats.ts`）：周期范围、完成数与上期**同期**完成数、最多的一天、24 小时分布、每日计数（含上一周期）、到期完成率、连续天数与最近 7 天、按根标签分布（传 `tagId` 时为该根标签下一级子标签的分布）、完成明细（倒序，最多 500 条） | FR-STA-01~06 |

P6 实现时把原计划的 4 个通道合并为一个：统计页每次切换都需要全部数据，一次往返更简单，查询都落在 `completed_local_date` 索引上。

### 2.4 设置、数据、系统

| 通道 | 入参 | 返回 | 需求 |
|---|---|---|---|
| `settings:get` / `settings:set` | — / `{ key, value }` | `Settings` | FR-SET-02/03 |
| `data:export` | — | `{ path }`（系统保存对话框） | FR-SET-06 |
| `data:import` | — | `{ imported }` | FR-SET-06 |
| `data:openFolder` | — | `void` | |
| `system:notificationStatus` | — | `'allowed'\|'denied'\|'unknown'` | FR-REM-09 |
| `window:minimize` / `window:close` | — | `void` | 自绘标题栏 |
| `app:info` | — | `AppInfo`（版本、数据目录、库版本、本次运行是否启用硬件加速） | FR-SET-02 |
| `app:relaunch` | — | `void`（重启程序，用于"硬件加速"等需重启的设置） | FR-SET-02 |

### 2.5 更新

| 通道 | 入参 | 返回 | 需求 |
|---|---|---|---|
| `update:getStatus` | — | `UpdateStatus` | FR-UPD-02/08 |
| `update:check` | — | `UpdateStatus` | FR-UPD-02 |
| `update:download` / `update:cancel` | — | `void` | FR-UPD-04 |
| `update:installNow` | — | `void`（程序将退出并重启） | FR-UPD-06 |
| `update:skip` | `{ version }` | `void` | FR-UPD-03 |

`UpdateStatus = { phase: 'idle'|'checking'|'latest'|'available'|'downloading'|'ready'|'error', current, latest?, releaseNotes?, releaseDate?, size?, progress?, lastCheckAt?, error? }`，与原型 `design/prototype/app.js` 中的状态一一对应。

## 3 主进程 → 渲染进程事件

| 事件 | 载荷 | 接收方 |
|---|---|---|
| `todos:changed` | `{ ids?: string[] }`（无 ids 表示全量刷新） | 主窗口 |
| `tags:changed` | — | 主窗口 |
| `today:count` | `{ open, done, total }` | 主窗口、悬浮窗 |
| `settings:changed` | `Partial<Settings>` | 主窗口、悬浮窗 |
| `theme:changed` | `{ dark: boolean }` | 主窗口、悬浮窗 |
| `update:status` | `UpdateStatus` | 主窗口 |
| `nav:open` | `{ view?, todoId? }` | 主窗口（通知 / 悬浮窗 / 托盘要求定位） |

## 4 悬浮窗 API（`preload/floating.ts`）

| 方法 / 事件 | 说明 |
|---|---|
| `getToday()` → `{ open, done, total }` | 初始计数 |
| `on('today:count')` / `on('theme:changed')` / `on('settings:changed')` | 计数、主题、透明度变化 |
| `openMain()` | 打开并聚焦主窗口"今天"视图（FR-FLT-02） |
| `dragEnd({ x, y })` | 保存位置（FR-FLT-04） |
| `showMenu()` | 弹出原生右键菜单（FR-FLT-05） |
