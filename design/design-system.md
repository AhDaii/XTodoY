# XTodoY 设计系统 v1.0

> 阶段：P2 界面原型 · 依据：[SRS v1.0](../docs/srs/SRS.md) · 工具：ui-ux-pro-max
> 令牌源文件：[`tokens.css`](tokens.css)（前端直接引用）· 原型：[`prototype/index.html`](prototype/index.html)、[`prototype/system.html`](prototype/system.html)

## 1 设计方向

| 项 | 结论 | 来源 |
|---|---|---|
| 产品类型 | Productivity Tool（个人效率工具，桌面端） | ui-ux-pro-max `--design-system` |
| 视觉风格 | **Minimalism & Swiss Style**：留白、清晰层级、网格对齐、功能优先、无装饰性元素 | 同上（Light / Dark 均支持，可访问性风险低） |
| 关键词 | 专注、安静、低干扰、可扫读 | 产品定位 |
| 动效 | 克制（Motion 3/10）：仅用于状态反馈与空间连续性，150–300 ms | 设计刻度 `--motion 3` |
| 密度 | 标准偏紧凑（Density 7/10）：桌面列表需一屏展示更多事项 | 设计刻度 `--density 7` |

**避免**：复杂引导流程、拟物质感、渐变与玻璃拟态、emoji 作图标、仅靠颜色传达状态、装饰性动画。

## 2 颜色

主色沿用 ui-ux-pro-max「Productivity Tool」配色（Teal 聚焦 + 行动橙），为满足桌面端与 WCAG AA 做了以下调整：

- 主色由 `#0D9488` 加深为 `#0F766E`，使白色文字达到 5.5:1（原色白字仅 3.7:1）；深色模式提亮为 `#2DD4BF` 配深色文字。
- 背景由偏青的 `#F0FDFA` 改为中性略带青灰的 `#F6F8F8`，长时间使用更安静；边框由 `#99F6E4` 改为中性 `#DBE3E1`。
- 强调橙 `#C2410C` 只用于「逾期日期」「警示」，不用作主按钮，避免与主色争夺注意力。

### 2.1 语义色

| 令牌 | 浅色 | 深色 | 用途 |
|---|---|---|---|
| `--background` | `#F6F8F8` | `#0C1211` | 窗口底色 |
| `--surface` | `#FFFFFF` | `#131A19` | 列表、面板、卡片 |
| `--surface-sunken` | `#EEF2F1` | `#0F1615` | 侧边栏、输入框底 |
| `--surface-raised` | `#FFFFFF` | `#1A2322` | 菜单、对话框、弹层 |
| `--surface-hover` / `--surface-selected` | `#E7EEEC` / `#D9ECEA` | `#1F2928` / `#183533` | 悬停 / 选中 |
| `--foreground` | `#0F1F1D` | `#E5EEEC` | 正文 |
| `--foreground-muted` | `#4F5D5B` | `#A3B1AE` | 次要文本 |
| `--foreground-subtle` | `#6B7876` | `#7F8D8A` | 占位、辅助 |
| `--primary` | `#0F766E` | `#2DD4BF` | 主按钮、选中、链接、焦点环 |
| `--accent` | `#C2410C` | `#FB923C` | 逾期、警示 |
| `--success` | `#15803D` | `#4ADE80` | 完成、全部完成 |
| `--destructive` | `#DC2626` | `#F87171` | 删除、危险操作 |
| `--control-border` | `#7D8B88` | `#6B7A77` | 单选框、输入框边框（非文本 ≥ 3:1） |

### 2.2 对比度校验

运行 `python design/scripts/check_contrast.py` 校验浅 / 深两套主题共 64 组组合，当前**全部达标**：

| 组合 | 浅色 | 深色 | 要求 |
|---|---|---|---|
| 正文 on surface | 17.0 | 14.9 | ≥ 4.5 |
| 次要文本 on surface | 6.9 | 8.0 | ≥ 4.5 |
| 辅助文本 on surface | 4.6 | 5.1 | ≥ 4.5 |
| 主按钮文字 on primary | 5.5 | 9.6 | ≥ 4.5 |
| 逾期橙 on surface | 5.2 | 7.8 | ≥ 4.5 |
| 单选框边框 on surface | 3.6 | 3.9 | ≥ 3.0 |
| 12 色标签胶囊文字 on 胶囊底 | 全部 ≥ 4.5 | 全部 ≥ 4.5 | ≥ 4.5 |

修改任何颜色令牌后必须重新运行该脚本。

### 2.3 标签色板（12 色）

`teal · blue · indigo · violet · pink · red · orange · amber · lime · green · cyan · slate`，每色提供 `--tag-<色>-fg`（文字 / 圆点）与 `--tag-<色>-bg`（胶囊底）两值，浅深各一套。子标签默认继承父标签颜色（SRS FR-TAG-05）。

### 2.4 优先级

单选框边框颜色表示优先级：高 `--priority-high`（红）、中 `--priority-medium`（橙）、低 `--priority-low`（蓝）、无 = 默认边框。**同时**在详情面板和悬停提示中以文字标出优先级，不只依赖颜色。

## 3 字体

ui-ux-pro-max 推荐 Plus Jakarta Sans（friendly / modern / productivity）。由于其**不含中文字形**，且桌面应用需离线可用、控制安装包体积，改用 Windows 系统字体栈，保持同样的现代无衬线气质：

```
"Segoe UI Variable Text", "Segoe UI", "Microsoft YaHei UI", "PingFang SC", "Noto Sans SC", system-ui, sans-serif
```

| 令牌 | 值 | 用途 |
|---|---|---|
| `--text-xs` | 12 px | 时间、计数、标签胶囊（最小字号） |
| `--text-sm` | 13 px | 次要文本、表单说明 |
| `--text-base` | 14 px | 正文、列表标题（Windows Fluent 桌面正文标准） |
| `--text-md` | 16 px | 面板 / 对话框标题 |
| `--text-lg` | 20 px | 页面标题 |
| `--text-xl` | 28 px | 统计大数字 |
| `--text-2xl` | 36 px | 悬浮窗数字 |

行高：正文 1.5，标题 1.25。数字统一使用 `font-variant-numeric: tabular-nums`，避免计数变化时抖动。

> 与 ui-ux-pro-max "正文 16px" 规则的差异：该规则针对网页 / 移动端；桌面工具在 100% 缩放下以 14px 为正文标准，并通过系统缩放（100%–200%）放大，最小字号仍保持 ≥ 12px。

## 4 间距、尺寸、圆角、阴影

- 间距：4 px 基准（`--space-1` … `--space-12`）。列表行内边距 12 px，面板内边距 16–24 px，分组间距 24 px。
- 尺寸：待办行高 44 px（满足 ≥ 44 px 点击区域）；圆形单选框可视 18 px、点击区域 32 px；按钮 32 px；快速输入框 40 px；侧边栏 240 px；详情面板 360 px；悬浮窗 64 px。
- 圆角：控件 6 px、卡片 / 面板 8 px、对话框 12 px、胶囊与单选框全圆。
- 阴影：仅用于浮层（菜单、对话框、悬浮窗、Toast），列表与面板用边框分隔而非阴影。

## 5 图标

- 使用 **Lucide** 图标（与 shadcn/ui 一致），描边 1.75 px，尺寸 16 / 20 px。原型中以内联 SVG 实现。
- 禁止 emoji 作为图标。
- 纯图标按钮必须有 `aria-label` 与悬停提示（tooltip）；装饰性图标 `aria-hidden="true"`。
- 托盘图标需提供浅色 / 深色任务栏两版（SRS IR-04），使用单色剪影。

## 6 动效

| 场景 | 时长 | 缓动 | 说明 |
|---|---|---|---|
| hover / 按下 | 120 ms | ease-out | 背景色变化 |
| 面板 / 弹层进入 | 200 ms | ease-out | 透明度 + 4–8 px 位移 |
| 面板 / 弹层退出 | 150 ms | ease-in | 退出比进入快 |
| 勾选完成 | 300 ms | ease-out | 单选框填充 + 对勾描边 → 标题删除线 → 约 1 s 后移入"已完成"分组 |
| Toast（撤销提示） | 200 ms 进 / 5 s 停留 | ease-out | 底部居中 |

`prefers-reduced-motion: reduce` 时所有时长归零（`tokens.css` 已内置）；勾选完成仍立即给出状态变化。

## 7 组件规范

### 7.1 圆形单选框（待办完成）

| 状态 | 外观 |
|---|---|
| 未完成 | 18 px 圆，1.5 px `--control-border`（或优先级色）边框，透明填充 |
| 悬停 | 边框加深，内部淡出显示对勾（提示可点） |
| 已完成 | `--primary` 填充 + 白色对勾；标题删除线、文字变为 `--foreground-subtle` |
| 焦点 | 2 px `--ring` 外环，2 px 偏移 |

可访问性：`role="checkbox"` + `aria-checked`，屏幕阅读器读出"完成：<标题>"；`Space` 切换。

### 7.2 待办行

`[单选框] 标题 ……… [循环图标][提醒图标] 时间 · [标签胶囊…]`
- 第一行：标题（单行省略），右侧为元信息；第二行（可选）：备注首行，`--text-sm` `--foreground-muted`。
- 逾期日期使用 `--accent`，并带"逾期"文字，不只依赖颜色。
- 悬停：`--surface-hover`；选中（打开详情）：`--surface-selected` + 左侧 2 px 主色指示条。

### 7.3 标签胶囊

高度 20 px、水平内边距 8 px、`--text-xs`、全圆角，左侧 6 px 色点；列表中最多显示 2 个，其余以 "+N" 表示，悬停显示完整路径。

### 7.4 侧边栏

智能视图（今天 / 计划 / 全部 / 已完成 / 回收站）+ 分隔线 + 标签树（可折叠，缩进 16 px / 级）+ 底部（统计、标签管理、设置）。每项右侧显示计数徽标（`--foreground-subtle`，`tabular-nums`）。

### 7.5 悬浮窗

64 × 64 px 圆角 16 px 方块，`--surface-raised` + `--shadow-lg` + 1 px 边框。中心为今日未完成数（36 px 粗体），下方小字"今日"。状态：有待办（主色数字）/ 全部完成（成功色对勾）/ 无待办（弱化 0）/ 悬停（展开提示"今日已完成 X / 共 Y"）。

### 7.6 系统通知

遵循 Windows Toast 模板：应用图标 + "XTodoY"；标题 = 事项标题；正文 = 时间 · 标签路径 · 备注首行；操作按钮「完成」「稍后提醒」。合并补发通知："你错过了 N 个提醒"。

## 8 页面清单与原型对应

| SRS 页面 ID | 页面 | 原型位置 |
|---|---|---|
| UI-01 | 主界面（侧边栏 + 列表 + 快速输入） | `index.html` 今天 / 计划 / 全部 / 已完成 / 标签视图 |
| UI-02 ~ UI-06 | 详情面板、日期时间、循环、提醒、标签选择器 | `index.html` 点击任一待办 |
| UI-07 / UI-08 | 标签管理、删除 / 合并对话框 | `index.html` 侧边栏「标签管理」 |
| UI-09 | 统计（日 / 周 / 月） | `index.html` 侧边栏「统计」 |
| UI-10 | 设置 | `index.html` 侧边栏「设置」 |
| UI-11 | 悬浮窗各状态 | `system.html` |
| UI-12 | 托盘菜单 | `system.html` |
| UI-13 | 系统通知（单条 / 合并补发） | `system.html` |
| UI-14 / UI-15 | 回收站、搜索结果 | `index.html` |
| UI-16 | 空状态、撤销提示条、确认对话框 | `index.html` + `system.html` |

所有页面均可通过原型右上角的主题切换（浅色 / 深色 / 跟随系统）查看两套主题。

本地预览：`python design/scripts/serve.py`，打开 http://127.0.0.1:5178/prototype/index.html（系统组件页为 `system.html`）。原型中的"今天"固定为 2026-11-02，数据不保存。

## 9 交付前检查（ui-ux-pro-max Pre-Delivery Checklist）

- [x] 无 emoji 图标，统一 Lucide SVG
- [x] 所有可点击元素有 `cursor: pointer` 与 120 ms 悬停反馈
- [x] 浅 / 深色文字对比度 ≥ 4.5:1，非文本 ≥ 3:1（脚本校验）
- [x] 键盘可达，焦点环可见（2 px `--ring` + 2 px offset）
- [x] 尊重 `prefers-reduced-motion`
- [x] 状态不只靠颜色：逾期 / 优先级 / 完成均有文字或形状辅助
- [x] 布局适配：主窗口最小 800 × 560，宽度 < 960 时详情面板覆盖显示
