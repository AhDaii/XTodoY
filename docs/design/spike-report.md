# XTodoY P3 技术验证报告

> 日期：2026-11-02 · 环境：Windows 11（10.0.26300）x64 · Node 26.13 · pnpm 12.16 · Electron 45.2.1
> 复现：`pnpm build && node scripts/measure-memory.mjs`（开发构建）；`pnpm dist && node scripts/measure-memory.mjs --packaged`（安装版）

## 结论速览

| # | 验证项 | 结论 | 状态 |
|---|---|---|---|
| 1 | 常驻内存与空闲 CPU | 三个内存指标全部达标，且有较大余量；关闭硬件加速后进一步下降 | ✅ 通过 |
| 2 | Windows 通知「完成」「稍后提醒」按钮 | 模板与协议解析已实现并有单元测试；按钮点击需安装版人工验证 | ⏳ 待人工验证 |
| 3 | 悬浮窗：透明、置顶、拖动、单击唤起 | 单击唤起、主题同步、计数同步由 E2E 自动验证；拖动与置顶需人工目测 | ✅ / ⏳ |
| 4 | 休眠唤醒后补发 | 时间跳跃检测与零点计算有单元测试；真实休眠需人工验证 | ⏳ 待人工验证 |
| 5 | better-sqlite3 打包可用 | 13.x 自带 N-API 预编译包，开发、Electron、安装版均直接可用，无需重编译 | ✅ 通过 |
| 6 | 自动更新 | `latest.yml`（版本、SHA-512、大小）与 blockmap 正常生成；完整升级流程留到首个测试版 | ⏳ 部分 |
| — | 安装包体积 | 114 MB；原 90 MB 指标经评审放宽为 ≤ 300 MB（SRS v1.1.1） | ✅ 通过 |

## 1 内存与 CPU（NFR-PERF-01~04）

口径：SRS 规定的"任务管理器 · 内存（专用工作集）"，对程序所有进程求和（WMI `WorkingSetPrivate`）；同时记录 private bytes（提交大小）供参考。每个场景启动 15 秒后，每 2 秒采样一次、共 10 次取平均。

### 1.1 安装版（最终配置：关闭硬件加速）

| 场景 | 进程数 | 专用工作集 | 目标 | private bytes | CPU 平均 / 峰值 |
|---|---|---|---|---|---|
| 仅托盘（无窗口） | 3 | **35.8 MB** | ≤ 80 MB ✅ | 53.2 MB | 0.02% / 0.14% |
| 托盘 + 悬浮窗 | 4 | **68.4 MB** | ≤ 130 MB ✅ | 104.4 MB | 0.33% / 1.71% |
| 主窗口打开 | 5 | **91.0 MB** | ≤ 250 MB ✅ | 127.7 MB | 0.19% / 0.96% |
| 主窗口打开后关闭 | 4 | **65.7 MB** | 回落到"托盘 + 悬浮窗" ✅ | 93.0 MB | 0.05% / 0.11% |

**P6 复测**（加入统计、备份、全局快捷键、自动更新后，未打包安装器的 `win-unpacked` 构建，2026-11-03）：

| 场景 | 进程数 | 专用工作集 | private bytes | CPU 平均 / 峰值 |
|---|---|---|---|---|
| 仅托盘 | 3 | **24.0 MB** | 54.6 MB | 0.01% / 0.11% |
| 托盘 + 悬浮窗 | 4 | **57.8 MB** | 84.7 MB | 0.02% / 0.12% |
| 主窗口打开 | 5 | **94.0 MB** | 133.2 MB | 0.01% / 0.08% |
| 主窗口打开后关闭 | 4 | **67.2 MB** | 94.9 MB | 0.01% / 0.06% |

新功能没有增加常驻内存：electron-updater 在第一次检查（启动 60 秒后）时才加载；每日备份延后 5 秒执行；统计页数据只在打开时查询。

### 1.2 硬件加速对比（开发构建）

| 场景 | 开启硬件加速 | 关闭硬件加速 | 变化 |
|---|---|---|---|
| 仅托盘 | 44.4 MB（private 102.0） | 35.3 MB（private 52.9） | -20%（private -48%） |
| 托盘 + 悬浮窗 | 72.5 MB（private 140.0） | 57.1 MB（private 84.0） | -21% |
| 主窗口打开 | 95.5 MB（private 202.7） | 90.3 MB（private 129.3） | -5% |

**决定**：默认关闭硬件加速（`app.disableHardwareAcceleration()`），并作为用户可选项（设置 › 外观 › 硬件加速，重启后生效；启动前从数据库只读读取，见 `src/main/app/launch-prefs.ts`）。差异主要来自 GPU 进程——即使没有任何窗口，开启硬件加速时 GPU 进程也占 60 MB 以上的提交内存。界面没有重度动画，软件渲染足够；环境变量 `XTODOY_ENABLE_GPU=1` 可临时打开用于对比。

### 1.3 其他发现

- **主窗口关闭即销毁有效**：关闭后渲染进程退出，内存回到"托盘 + 悬浮窗"水平。
- 悬浮窗场景偶有 1–2% 的 CPU 峰值，出现在启动后加载阶段；平均 0.33%，低于 0.5% 的要求。1 小时长时间空闲曲线放到 P7 性能测试。
- 网络服务进程（Network Service）固定约 11 MB，是 Chromium 结构的一部分，无法去掉。

## 2 Windows 通知按钮（FR-REM-04）

- 实现：`src/main/platform/notifier.ts` 生成 `ToastGeneric` 模板，「完成」「稍后提醒」按钮使用 `activationType="protocol"`，参数为 `xtodoy://complete?id=…` / `xtodoy://snooze?id=…`；程序通过 `second-instance` 收到链接并解析（`parseProtocolUrl`，有单元测试）。
- 协议在 **安装时** 由 NSIS 注册到当前用户（`electron-builder.yml` 的 `protocols`）；开发环境不注册，避免改动系统注册表。因此按钮回调只能在安装版上验证。
- **待人工验证**（P4 开始前完成）：
  1. 运行 `release/0.1.0/XTodoY-Setup-0.1.0.exe` 安装；
  2. 在主窗口点"发送测试通知"；
  3. 分别点通知正文、「完成」「稍后提醒」，确认程序收到对应动作（日志 `[protocol] …`），且点「完成」时不弹出主窗口。
- 备选方案（若 protocol 激活不理想）：改用 Windows App SDK 通知的 COM 激活，或在通知被点击时打开主窗口并定位事项，按钮降级为通知内只保留"打开"。

## 3 悬浮窗（FR-FLT-01~04）

- 64×64、无边框、透明、`alwaysOnTop('screen-saver')`、`skipTaskbar`、`focusable: false`，`showInactive()` 显示，不抢焦点。
- 拖动与单击区分：指针移动超过 3 px 视为拖动，拖动结束只保存位置、不打开主窗口；位置所在显示器不存在时回到主显示器右下角。
- 自动验证（Playwright E2E）：显示计数、计数随新增待办同步、主题同步、单击打开主窗口。
- **待人工目测**：拖动是否跟手、全屏应用之上是否仍置顶、多显示器与 150% / 200% 缩放下的位置与清晰度。

## 4 休眠唤醒与时钟变化（FR-REM-07、FR-REC-08）

- `powerMonitor` 的 `resume` / `unlock-screen` 触发 `time.jumped` 事件，今日计数立即重算并重挂零点定时器。
- 定时器触发时的"时间跳跃"判断（`detectTimeJump`，阈值 60 秒）覆盖了手动调整系统时间的情况；零点计算覆盖跨月。均有单元测试。
- **待人工验证**：让电脑睡眠跨过零点，唤醒后 5 秒内悬浮窗计数刷新（提醒补发在 P5 实现调度器后一并验证）。

## 5 better-sqlite3 打包

- better-sqlite3 13.x 改为自带 N-API 预编译包（`prebuilds/win32-x64.node`），与 Electron ABI 无关：Node 26、Electron 45 主进程、安装版均直接加载成功，**不需要** `electron-rebuild`，因此关闭了 `npmRebuild`。
- 打包配置：`asarUnpack` 解出原生模块；只保留 `win32-x64` 预编译包，去掉 SQLite 源码（每个安装包省约 25 MB 未压缩体积）。
- 迁移：`migrations/0001_init.sql` 在事务中执行，失败整体回滚、拒绝降级（单元测试覆盖）；已有数据的库在迁移前用 `VACUUM INTO` 做一致性快照。

## 6 自动更新

- `pnpm dist` 生成 `XTodoY-Setup-0.1.0.exe`、`.blockmap`（差分更新）与 `latest.yml`（版本、SHA-512、大小、发布日期），`resources/app-update.yml` 指向 `AhDaii/XTodoY`。
- 发布流水线 `.github/workflows/release.yml`：推送 `v*` 标签 → 检查 → 构建 → 上传 Releases 草稿。
- P6 在打包构建中验证：启动 60 秒后自动检查，electron-updater 按需加载并请求 `github.com/AhDaii/XTodoY/releases`；当前仓库还没有正式发布，返回"Unable to find latest version"，自动检查静默失败，原因写入 `<数据目录>/logs/main.log`（FR-UPD-09）。注意：`electron-builder --dir` 不生成 `app-update.yml`，只有完整安装包构建才有。
- 完整升级流程（下载、校验、退出时安装、更新前备份、迁移）需要两个真实发布版本，在第一个测试版 `v0.2.0-beta.1` → `v0.2.0-beta.2` 时验证，记入发布检查清单。

## 7 安装包体积（NFR-PERF-09）

| 版本 | 安装包 | 解压后 | 说明 |
|---|---|---|---|
| 默认配置 | 130.1 MB | 385 MB | 含 55 种语言包、better-sqlite3 全平台预编译包与源码 |
| 精简后（当前） | **113.8 MB** | 313 MB | 只保留中文 / 英文语言包、只保留 Windows x64 原生模块、最高压缩 |

剩余体积几乎全部来自 Electron 45 本体（`XTodoY.exe` 239 MB、`dxcompiler.dll` 25 MB 等），应用自身代码 < 2 MB，已无进一步压缩空间。

**评审结论**：原"≤ 90 MB"在 Electron 下无法达到，SRS v1.1.1 将 NFR-PERF-09 放宽为 **≤ 300 MB**（暂定上限，后续视情况调整）。当前 114 MB 留有充足余量；日常更新走 blockmap 差分下载，实际下载量远小于完整安装包。上面的精简配置继续保留。

## 8 版本与工具链决定

| 项 | 规划 | 实际 | 原因 |
|---|---|---|---|
| React | 18 | 19.3 | 当前稳定版 |
| TypeScript | — | 6.0 | 7.x（原生编译器）暂不被 typescript-eslint 支持 |
| 图表库 | Recharts | 不引入，自绘 SVG | 原型已用 SVG 实现全部统计图，少打包数百 KB 的依赖 |
| Node（开发） | 22 LTS | 26（本机）/ 24（CI） | 本机已装 26；CI 用 24 LTS，`engines` 要求 ≥ 24 |
| pnpm 构建脚本 | — | `pnpm-workspace.yaml` 的 `allowBuilds` | pnpm 12 默认拦截依赖安装脚本，需要显式放行 `electron` |
| 主题同步 | 渲染进程监听 `prefers-color-scheme` | 主进程推送 `theme:changed` | E2E 发现切换主题后渲染进程不一定及时收到媒体查询变化 |
