# XTodoY 测试计划与测试报告（P7）

> 依据：[SRS v1.1.3](../srs/SRS.md) · [项目规划](../PROJECT_PLAN.md) P7 · 追踪矩阵 [traceability.md](traceability.md) · 人工清单 [manual-checklist.md](manual-checklist.md)

## 1 范围

- **v1.0 验收范围**：SRS 中全部 M / S 级需求（C 级的 FR-TODO-09 批量操作、FR-REM-10 应用内提醒弹窗推迟到 v1.1）。
- **平台**：Windows 10 / 11 x64 为主平台，全部用例在其上执行；macOS / Linux 为次要平台，验证"可构建、可启动、基本可用"。

## 2 测试层次

| 层次 | 位置 | 运行 | 覆盖 |
|---|---|---|---|
| 单元测试 | `tests/unit/` | `pnpm test`，每次 CI（Windows / macOS / Linux） | 领域规则（循环、提醒时刻、视图分组、统计周期、版本比较）、服务层（待办、标签、统计、备份、更新、调度器）、数据库迁移与恢复 |
| 端到端 | `tests/e2e/smoke.spec.ts` | `pnpm build && pnpm test:e2e`，每次 CI（Windows） | 用 Playwright `_electron` 驱动真实程序：主流程、悬浮窗、设置、更新（模拟更新器）、导入导出、快捷键、排序 |
| 打包冒烟 | `.github/workflows/ci.yml` platforms | 每次 CI（macOS / Linux） | 打包后启动程序（指标模式）：数据库、托盘、原生模块可用 |
| 容量 / 性能 | `tests/perf/capacity.test.ts`、`tests/e2e/perf.spec.ts`、`scripts/measure-memory.mjs` | `pnpm test:perf`、`PERF=1 pnpm exec playwright test perf`、`pnpm spike:metrics --packaged`；发布前执行 | NFR-PERF-01~07 |
| 人工 | `manual-checklist.md` | 每个候选版本（rc）执行一次 | 通知按钮、开机自启、休眠、时区、多显示器、高 DPI、真实升级、长时间运行、读屏、macOS / Linux |

模拟手段：时间与定时器用 Vitest 假时钟；时区用 `TZ` 环境变量；系统文件对话框在主进程中替换；更新用 `XTODOY_FAKE_UPDATE`；通知权限用 `XTODOY_NOTIFY_STATUS`（后两者仅在开发构建中生效）。

## 3 准入与准出

- **准入（提测）**：CI 全绿（lint、typecheck、单元、E2E、macOS / Linux 打包冒烟）。
- **准出（发布 v1.0.0）**：
  1. 自动化测试全部通过；
  2. 容量 / 性能测试全部在预算内；
  3. 人工清单中 Windows 项（M-01~M-17）全部通过，或问题已评估为不阻塞并记入 Issues；
  4. M-10 真实升级通过（rc.1 → rc.2）；
  5. macOS / Linux 至少完成 M-20、M-24（可启动、基本可用）。

## 4 自动化测试结果（2026-11-03，develop @ P7）

| 项目 | 数量 | 结果 |
|---|---|---|
| 单元测试 | 125 | ✅ 全部通过 |
| 端到端（Windows） | 25 | ✅ 全部通过 |
| 打包冒烟（macOS arm64 / Linux x64） | 2 | ✅ 启动并写出指标 |
| 容量（服务层） | 13 项计时 | ✅ 全部在预算内（见 §5） |
| 界面性能 | 3 项 | ✅ 全部在预算内（见 §5） |

## 5 性能结果

### 5.1 容量（NFR-PERF-06 / 07）

1 万条事项、10 万条完成记录、500 个标签；主进程服务层（不含 IPC 与渲染），5 次中位数（开发机）：

| 操作 | 用时 | 预算 |
|---|---|---|
| 今天 / 计划 / 全部视图 | 1.9 / 10.0 / 16.5 ms | 100 ms |
| 标签视图（含子标签） | 17.9 ms | 100 ms |
| 侧边栏计数 / 标签树 | 3.0 / 12.6 ms | 100 ms |
| 勾选完成并取消 / 新建 | 5.9 / 0.9 ms | 100 ms |
| 搜索 | 5.0 ms | 200 ms |
| 统计 日 / 周 / 月 / 月（标签下钻） | 5.4 / 5.8 / 6.2 / 19.9 ms | 500 ms |

**本次发现并修复**：标签树的"含子孙未完成数"用标签 × 标签的 `LIKE` 前缀连接，1 万条事项时需约 2.2 秒；侧边栏在每次事项变化后都会刷新标签树，会造成每次勾选后主进程卡顿 2 秒。改为一次取出未完成事项的标签路径在内存中按祖先累加后，降到 12.6 ms（`src/main/services/tags.ts`）。

### 5.2 界面（NFR-PERF-03 / 05 / 06）

开发构建，1000 条未完成事项，"全部"视图（`tests/e2e/perf.spec.ts`）：

| 指标 | 结果 | 预算 |
|---|---|---|
| 冷启动到主窗口可交互 | 589 ms | ≤ 2 s |
| 主窗口打开时所有进程专用工作集 | 178.5 MB | ≤ 250 MB |
| 界面勾选（单击到列表更新） | 46 ms | ≤ 100 ms |

**本次发现并修复**：1000 行全部参与布局与绘制，专用工作集 260 MB 超出预算；为非拖拽行启用 `content-visibility: auto` 后降到约 175–180 MB，勾选响应也由 49 ms 降到约 30–46 ms。

### 5.3 常驻内存（NFR-PERF-01 / 02）

安装版构建（`pnpm spike:metrics --packaged`，P6 复测）：仅托盘 24.0 MB（≤ 80）、托盘 + 悬浮窗 57.8 MB（≤ 130）、主窗口打开后关闭 67.2 MB。详见 [spike-report.md](../design/spike-report.md) §1.1。

### 5.4 安装包（NFR-PERF-09）

Windows 安装包 `XTodoY-Setup-1.0.0-rc.1.exe` 113.9 MB（≤ 300 MB），`app.asar` 2.1 MB。

**本次发现并修复**：P7 多平台改造时在 win / mac / linux 下分别写了 `files`，而 electron-builder 的平台级 `files` 会**整体替换**顶层列表，只含排除规则时等于"打包整个仓库"——源码、测试、`.claude`、旧的 `release/` 产物都被打进了 `app.asar`（424 MB，安装包 340 MB）。修复为各平台写全列表，并新增 `scripts/check-package.mjs`：CI（三平台）与发布流水线在打包后检查包内容与大小，不合格即失败。

## 6 人工测试

见 [manual-checklist.md](manual-checklist.md)，在 v1.0.0-rc.1 安装版上执行并记录结果。
