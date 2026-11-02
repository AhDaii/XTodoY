# XTodoY 架构设计

> 阶段：P3 技术设计 · 依据：[SRS v1.1](../srs/SRS.md)、[设计系统 v1.2](../../design/design-system.md)
> 相关：[数据库设计](database.md) · [IPC 接口](ipc.md) · [发布与更新](release.md) · [技术验证报告](spike-report.md)

## 1 技术栈（定版）

| 层 | 选型 | 版本 | 备注 |
|---|---|---|---|
| 运行时 | Electron | 45.x | 主进程 Node + Chromium |
| 构建 | electron-vite（Vite 8 / Rolldown） | 6.x | main / preload / renderer 多入口 |
| 语言 | TypeScript | 6.0.x | 7.x（原生编译器）暂不兼容 typescript-eslint，P6 再评估 |
| 界面 | React 19 + Tailwind CSS 4 | 19.x / 4.x | 设计令牌来自 `design/tokens.css` |
| 状态 | Zustand | 5.x | 只存视图状态；业务数据以主进程为准 |
| 图表 | 自绘 SVG | — | 原型已验证（折线、热力图、环形图），不引入 Recharts，减小包体 |
| 数据库 | better-sqlite3（手写 SQL） | 13.x | 13.x 自带 N-API 预编译包，无需针对 Electron 重编译；P4 决定不引入 ORM |
| 循环规则 | rrule | 2.8.x | 只用于解析 / 展开，月末规则自行补充（FR-REC-04） |
| 打包 / 更新 | electron-builder + electron-updater | 26.x / 6.x | NSIS 当前用户级安装；GitHub Releases |
| 测试 | Vitest + Playwright（`_electron`） | 5.x / 1.6x | |
| 包管理 | pnpm | 12.x | 构建脚本白名单见 `pnpm-workspace.yaml` |

## 2 进程与窗口

```
┌──────────────────────────── 主进程（常驻，Node） ────────────────────────────┐
│ app/        启动、单实例、生命周期、退出流程                                  │
│ db/         连接、迁移、仓储（唯一读写数据库的地方）                          │
│ domain/     纯函数：循环展开、今日口径、提醒触发时间、统计聚合               │
│ services/   todo · tag · reminder-scheduler · stats · settings · backup ·    │
│             update                                                           │
│ platform/   tray · notifier · windows（主窗口 / 悬浮窗）· power · autostart · │
│             theme                                                            │
│ ipc/        handle 注册、入参校验、事件广播                                   │
└───────────────┬───────────────────────────────────────┬──────────────────────┘
        contextBridge（preload）                 contextBridge（preload）
┌───────────────┴──────────────┐          ┌─────────────┴──────────────┐
│ 主窗口渲染进程（React）       │          │ 悬浮窗渲染进程（原生 TS）    │
│ 按需创建，关闭即销毁          │          │ 64×64，常驻（可关闭）         │
└──────────────────────────────┘          └────────────────────────────┘
```

原则：

1. **业务逻辑全部在主进程**。渲染进程只负责展示与收集输入，通过 IPC 调用服务；这样主窗口销毁后提醒、托盘、悬浮窗照常工作（NFR-REL-04）。
2. **domain 层是纯函数**，不依赖 Electron 与数据库，单元测试覆盖率 ≥ 80%（NFR-MNT-01）。
3. **只有一个数据库连接**，位于主进程，WAL 模式；所有写操作走服务层事务。

### 2.1 窗口生命周期

| 窗口 | 创建时机 | 关闭 / 隐藏 | 关键选项 |
|---|---|---|---|
| 主窗口 | 用户打开（托盘、悬浮窗、通知、二次启动）时创建 | 关闭按钮 → `closeAction = tray` 时 **销毁** 窗口（不是隐藏），释放渲染进程内存；`quit` 时退出程序 | `contextIsolation`、`sandbox`、`spellcheck: false`、`backgroundThrottling: true`、记忆位置与大小 |
| 悬浮窗 | 启动时若设置开启则创建 | 设置关闭时销毁 | 无边框、透明、`alwaysOnTop: 'screen-saver'` 级别、`skipTaskbar`、`focusable: false`、`resizable: false` |
| 托盘 | 启动即创建，程序退出前一直存在 | — | 浅 / 深任务栏两套图标 |

主窗口再次打开时从 IPC 重新拉取数据，不保留旧状态。窗口创建到首帧可交互目标 ≤ 2 秒（NFR-PERF-05）。

### 2.2 启动与退出

**启动**：单实例锁 → 打开数据库 → 迁移（失败回滚，见数据库设计）→ 每日首次自动备份 → 初始化服务 → 提醒调度器装载 → 补发错过的提醒 → 托盘 → 悬浮窗 → （非自启时）主窗口 → 60 秒后检查更新。

**退出**（托盘"退出"或 `Ctrl+Q`）：停止调度器 → 等待写入完成 → 关闭数据库 → 若有已下载的更新则执行"更新前备份"并调用 `autoUpdater.quitAndInstall(true, false)`（静默安装、不自动重启）→ 退出。

## 3 关键机制

### 3.1 提醒调度（FR-REM-06/07，NFR-PERF-04）

- 调度器维护 **最小堆**：`(fireAt, reminderId)`，只保留未触发、未完成、未删除事项的提醒。
- 只挂 **一个** `setTimeout` 到堆顶时间；超过 `2^31-1` 毫秒时分段等待。没有轮询。
- 触发时：再次读库确认仍有效 → 发通知 → 写 `fired_at` → 计算该事项下一次提醒（循环事项）→ 重新挂定时器。
- 数据变更（事项 / 提醒的增删改、完成、暂停提醒）后通过领域事件重建受影响的条目。
- **补发**：启动、`powerMonitor` 的 `resume`、以及定时器触发时发现实际时间比预期晚超过 60 秒（说明系统休眠或时钟被调整），都执行一次"错过提醒"扫描：24 小时内的补发，超过 3 条合并为一条（D-4）。
- **时区变化**：Electron 没有时区事件；在 `resume` 和每天零点重算时比较 `Intl.DateTimeFormat().resolvedOptions().timeZone` 与 UTC 偏移，变化则重建整个堆（FR-REC-08）。

### 3.2 今日计数与跨零点（FR-FLT-03）

- 服务层在数据变更后计算今日计数（`未完成 / 已完成 / 总数`，口径 D-1：仅今天到期），通过事件推送给悬浮窗、托盘提示和主窗口。
- 一个零点定时器（同样单个 `setTimeout`）在本地日期变化时重新计算，并重排逾期分组；从休眠唤醒时也会触发。

### 3.3 通知（FR-REM-03/04，IR-03）

- 统一由 `platform/notifier` 发出。Windows 上使用 `toastXml` 模板，带「完成」「稍后提醒」按钮；具体的按钮回调机制由 P3 技术验证确定（见 [spike-report.md](spike-report.md) §2）。
- 启动时设置 `app.setAppUserModelId('com.xtodoy.app')`，保证通知归属与操作中心保留。
- 通知被点击 / 按钮被点击时，经 `second-instance` 或通知事件回到主进程，调用服务完成事项或稍后提醒，**不必创建主窗口**。

### 3.4 主题（FR-SET-01）

- 设置值 `light | dark | system` 存库；`nativeTheme.themeSource` 跟随设置，`nativeTheme.on('updated')` 时广播 `theme:changed`。
- 渲染进程在 `<html>` 上切换 `dark` class，所有颜色来自 `design/tokens.css`（NFR-MNT-02）。

### 3.5 领域事件

主进程内部用一个强类型 `EventEmitter`（`events/bus.ts`）解耦服务与平台层：

| 事件 | 发出者 | 订阅者 |
|---|---|---|
| `todos.changed` | todo / tag 服务 | 调度器、今日计数、IPC 广播 |
| `reminders.changed` | todo 服务 | 调度器 |
| `today.count` | 今日计数 | 悬浮窗、托盘、IPC 广播 |
| `settings.changed` | settings 服务 | 主题、悬浮窗、自启、更新、调度器 |
| `update.status` | update 服务 | 托盘、IPC 广播 |

## 4 安全（NFR-SEC-02/04/05）

- 所有窗口：`contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`、`webSecurity: true`；页面 CSP：`default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:`。
- preload 只暴露白名单 API（见 [ipc.md](ipc.md)），主进程对每个入参做运行时校验，拒绝未知字段。
- 阻止导航与新窗口：`will-navigate`、`setWindowOpenHandler` 一律拒绝，外部链接用 `shell.openExternal` 且只允许 `https:`。
- 更新只接受 HTTPS + SHA-512 校验通过的安装包，拒绝降级；签名凭据只存在 CI 密钥中（见 [release.md](release.md)）。

## 5 目录结构

```
src/
├─ main/
│  ├─ index.ts                 # 入口：单实例、启动顺序、退出流程
│  ├─ app/                     # lifecycle、paths、logger
│  ├─ db/                      # client.ts、schema.ts、migrate.ts、repos/
│  ├─ domain/                  # recurrence.ts、today.ts、reminders.ts、stats.ts（纯函数）
│  ├─ services/                # todo、tag、scheduler、stats、settings、backup、update
│  ├─ platform/                # tray、notifier、windows/{main,floating}、power、autostart、theme
│  ├─ events/bus.ts
│  └─ ipc/                     # handlers.ts、validate.ts
├─ preload/
│  ├─ main.ts                  # 主窗口 API
│  └─ floating.ts              # 悬浮窗 API（只有今日计数与"打开主窗口"）
├─ renderer/
│  ├─ main/                    # React 应用：app/ pages/ components/ stores/ api/ styles/
│  └─ floating/                # index.html + floating.ts（无框架）
└─ shared/                     # ipc 类型、领域类型、常量（主 / 渲染共用）
resources/                     # 图标、托盘图标、installer 资源
migrations/                    # drizzle-kit 生成的 SQL 迁移
tests/
├─ unit/                       # Vitest：domain、services（内存 SQLite）
└─ e2e/                        # Playwright _electron
```

## 6 性能预算（NFR-PERF）

| 场景 | 目标 | 手段 |
|---|---|---|
| 仅托盘 | ≤ 80 MB | 无任何 BrowserWindow；关闭硬件加速（GPU 进程内存减半）；主进程懒加载 update / stats 模块 |
| 托盘 + 悬浮窗 | ≤ 130 MB | 悬浮窗页面无框架、无图片、CSS < 5 KB |
| 主窗口打开 | ≤ 250 MB | 路由级代码分割；统计页按需加载 |
| 空闲 CPU | < 0.5% | 单定时器调度；无轮询；后台窗口节流 |

实测结果与调整见 [spike-report.md](spike-report.md)。
