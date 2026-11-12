# XTodoY 需求追踪矩阵（测试用例）

> 依据：[SRS v1.1.3](../srs/SRS.md) 附录 A · 测试计划见 [test-plan.md](test-plan.md) · 人工用例见 [manual-checklist.md](manual-checklist.md)
>
> 用例编号 `TC-<需求编号>-<序号>`。类型：**U** 单元测试（`tests/unit`）· **E** 端到端（`tests/e2e/smoke.spec.ts`）· **P** 性能（`tests/perf`、`tests/e2e/perf.spec.ts`）· **S** 打包冒烟（CI macOS / Linux）· **M** 人工（`manual-checklist.md` 中的编号）。
> 测试名称为测试代码中 `it` / `test` 的标题，可直接搜索定位。

## F1 待办

| 用例 | 需求 | 类型 | 测试 |
|---|---|---|---|
| TC-TODO-01-1 | FR-TODO-01 新建 | E | 在"今天"新建待办：列表、侧边栏计数、悬浮窗同步 |
| TC-TODO-01-2 | FR-TODO-01 | U | services：新建的待办出现在今天视图，计数正确 |
| TC-TODO-02-1 | FR-TODO-02 编辑 | E | 详情面板：改标题、设日期、设优先级，删除后进回收站并可恢复 |
| TC-TODO-02-2 | FR-TODO-02 | U | services：清除日期时一并清除时间 |
| TC-TODO-03-1 | FR-TODO-03 完成 / 撤销 | E | 勾选完成后可撤销；全部完成时显示完成状态 |
| TC-TODO-03-2 | FR-TODO-03 | U | services：勾选完成写入完成记录，撤销后删除记录 |
| TC-TODO-03-3 | FR-TODO-03 勾选动效（#24） | E | #22 窄宽度标题栏……；#24 勾选框先播放动画再提交 |
| TC-TODO-04-1 | FR-TODO-04 删除 / 回收站 | U | services：删除进回收站可撤销；永久删除级联删除完成记录 |
| TC-TODO-04-2 | FR-TODO-04 | E | 详情面板：……删除后进回收站并可恢复 |
| TC-TODO-05-1 | FR-TODO-05 智能视图 | U | views：今天 / 计划 / 全部 / 已完成 / 回收站 分组（共 8 项） |
| TC-TODO-06-1 | FR-TODO-06 排序 | E | 排序：按视图记忆排序方式；手动模式下拖拽与 Alt+↑↓ 调整顺序，重启后保持 |
| TC-TODO-06-2 | FR-TODO-06 | U | reorder：放到某项之前 / 之后；位置不变不发请求；Alt+↑↓；按字符编码比较排序键 |
| TC-TODO-07-1 | FR-TODO-07 优先级 | E | 详情面板：……设优先级 |
| TC-TODO-08-1 | FR-TODO-08 搜索 | U | services：搜索匹配标题与备注，转义通配符 |
| TC-TODO-08-2 | FR-TODO-08（1000 条 200 ms） | P | capacity：搜索"周报" ≤ 200 ms（1 万条） |
| — | FR-TODO-09 批量操作 | — | 推迟到 v1.1（SRS v1.1.3） |

## F2 时间与循环

| 用例 | 需求 | 类型 | 测试 |
|---|---|---|---|
| TC-REC-01-1 | FR-REC-01 日期时间 | E | 详情面板：……设日期 |
| TC-REC-02-1 | FR-REC-02 循环规则 | U | recurrence：生成标准 RRULE、每 2 天、工作日、每周一三五、每 2 周 |
| TC-REC-02-2 | FR-REC-02 工作日 / 工作日第一天（v1.1.4） | U | workdays：法定假日与调休、休息后的第一个工作日、每个工作日跳过国庆、工作日第一天序列化与实例 |
| TC-REC-02-3 | FR-REC-02（v1.1.4） | E | 循环"工作日第一天"：按法定节假日与调休生成实例 |
| TC-REC-02-4 | IR-12 节假日数据 | U | HolidayService：联网获取并缓存、失败 / 不合法 / 空文件不改动、损坏缓存被忽略 |
| TC-REC-03-1 | FR-REC-03 结束条件 | U | recurrence：结束日期与次数；达到次数后不再有下一次 |
| TC-REC-04-1 | FR-REC-04 月末 | U | recurrence：每月 31 日小月落在最后一天；闰年 2 月；2 月 29 日 |
| TC-REC-05-1 | FR-REC-05 完成语义 | E | 循环事项：设置每天循环，完成后进入下一次并可撤销 |
| TC-REC-05-2 | FR-REC-05 | U | recurrence：周三完成周一的实例；逾期 3 周跳到不早于今天的实例 |
| TC-REC-06-1 | FR-REC-06 跳过本次 | U | services：跳过本次——移到下一次实例，不写完成记录，可撤销 |
| TC-REC-07-1 | FR-REC-07 编辑规则 | U | scheduler：清除截止日期时移除相对提醒与循环 |
| TC-REC-08-1 | FR-REC-08 时区 | U | timezone：AC 切换时区后"每天 9:00"按新时区触发；检测名称或偏移变化 |
| TC-REC-08-2 | FR-REC-08 | M | M-07 实际切换系统时区 |

## F3 提醒

| 用例 | 需求 | 类型 | 测试 |
|---|---|---|---|
| TC-REM-01-1 | FR-REM-01 设置提醒 | E | 提醒：带时间的事项自动加"准时"提醒；可添加自定义提前量 |
| TC-REM-01-2 | FR-REM-01 | U | reminders：相对 / 全天 / 无截止日期时的触发时刻 |
| TC-REM-02-1 | FR-REM-02 默认提醒 | U | scheduler：带时间的新事项自动加"准时"提醒并在截止时间触发 |
| TC-REM-03-1 | FR-REM-03 系统通知 | E | 提醒到时发出系统通知（调度器 → 通知） |
| TC-REM-04-1 | FR-REM-04 通知按钮 | U | notifier：包含标题、正文与两个 protocol 按钮；解析三种动作；拒绝非法链接 |
| TC-REM-04-2 | FR-REM-04 | M | M-01 在安装版上点击通知的「完成」「稍后提醒」 |
| TC-REM-05-1 | FR-REM-05 稍后提醒 | U | scheduler：稍后提醒 10 分钟后再次提醒 |
| TC-REM-06-1 | FR-REM-06 准时性 | U | scheduler：在截止时间触发（单定时器） |
| TC-REM-07-1 | FR-REM-07 补发 | U | scheduler：唤醒后补发 24 小时内的提醒，超过 3 条合并；超过 24 小时不补发 |
| TC-REM-07-2 | FR-REM-07 | M | M-03 真实睡眠跨过提醒时刻 |
| TC-REM-08-1 | FR-REM-08 完成不提醒 | U | scheduler：完成事项后取消提醒，取消完成且时刻未过则恢复 |
| TC-REM-09-1 | FR-REM-09 通知权限 | E | 系统通知被关闭时，主窗口与设置页提示并提供系统设置入口 |
| TC-REM-09-2 | FR-REM-09 | U | 解析 reg query 的 REG_DWORD 输出 |
| TC-REM-09-3 | FR-REM-09 | M | M-06 在系统设置中关闭 XTodoY 通知 |
| — | FR-REM-10 应用内弹窗 | — | 推迟到 v1.1 |
| TC-REM-11-1 | FR-REM-11 提醒声音 | U | notifier：提醒声音关闭时静音，开启时使用系统默认声音 |

## F4 / F5 标签与标签管理

| 用例 | 需求 | 类型 | 测试 |
|---|---|---|---|
| TC-TAG-01-1 | FR-TAG-01 多级 | U | services：最多 5 级；同级重名被拒绝；移动后超过 5 级被拒绝 |
| TC-TAG-02-1 | FR-TAG-02 设置标签 | U | services：每个待办最多 10 个标签，标签必须存在 |
| TC-TAG-03-1 | FR-TAG-03 按标签浏览 | E | 多级标签：新建、挂到待办、按父标签浏览包含子标签 |
| TC-TAG-03-2 | FR-TAG-03 | U | services：含子标签的标签视图 |
| TC-TAG-04-1 | FR-TAG-04 视图内筛选 | E | 标签视图显示已完成；标签树方向键导航 |
| TC-TAG-05-1 | FR-TAG-05 颜色 | U | services：子标签默认继承父标签颜色，显示路径完整 |
| TC-TGM-01-1 | FR-TGM-01~02 管理页 / 增删改 | E | 多级标签：新建…… |
| TC-TGM-03-1 | FR-TGM-03 拖拽改层级 | U | services：移动标签改写子孙路径与深度，不能移入自己的子孙 |
| TC-TGM-04-1 | FR-TGM-04 删除 | E | 删除父标签时子标签上移一级，待办保留 |
| TC-TGM-04-2 | FR-TGM-04 | U | services：删除标签——子标签上移 / 一并删除子孙 |
| TC-TGM-05-1 | FR-TGM-05 合并 | U | services：合并——事项改挂目标（不重复），子标签移到目标下 |
| TC-TGM-06-1 | FR-TGM-06 键盘 | E | 标签视图显示已完成；标签树方向键导航 |

## F6 后台常驻

| 用例 | 需求 | 类型 | 测试 |
|---|---|---|---|
| TC-BG-01-1 | FR-BG-01 / 02 托盘、关闭到托盘 | E | 关闭主窗口后程序继续运行，单击悬浮窗重新打开主窗口 |
| TC-BG-03-1 | FR-BG-03 退出 | E | 每个用例结束时正常退出（数据库在 will-quit 关闭） |
| TC-BG-04-1 | FR-BG-04 单实例 | M | M-09 重复启动只激活已有实例 |
| TC-BG-05-1 | FR-BG-05 开机自启 | M | M-02 安装版开启自启后重启电脑 |
| TC-BG-06-1 | FR-BG-06 暂停提醒 | E | 暂停提醒与恢复 |
| TC-BG-06-2 | FR-BG-06 | U | scheduler：暂停期间不提醒，暂停结束后补发 |
| TC-BG-07-1 | FR-BG-07 低资源 | P | 见 NFR-PERF-01~04 |

## F7 悬浮窗

| 用例 | 需求 | 类型 | 测试 |
|---|---|---|---|
| TC-FLT-01-1 | FR-FLT-01 / 03 显示、口径 | E | 在"今天"新建待办：……悬浮窗同步；勾选完成后……全部完成状态 |
| TC-FLT-02-1 | FR-FLT-02 唤起主窗口 | E | 关闭主窗口后……单击悬浮窗重新打开主窗口 |
| TC-FLT-04-1 | FR-FLT-04 拖动与位置 | M | M-08 多显示器：拖到副屏、拔掉副屏后重启 |
| TC-FLT-04-2 | FR-FLT-04 不被拖出屏幕、贴边吸附 | U + E | floating：拖动不出工作区、取整无 -0、20 px 内贴边、多显示器、可见性；E2E：rc.1 反馈 |
| TC-FLT-05-1 | FR-FLT-05 右键菜单 / 透明度 | E | 悬浮窗透明度设置生效 |
| TC-FLT-06-1 | FR-FLT-06 主题 | E | 主题设置同时作用于主窗口和悬浮窗，并在重启后保留 |

## F8 统计

| 用例 | 需求 | 类型 | 测试 |
|---|---|---|---|
| TC-STA-01-1 | FR-STA-01 数据源 | U | stats：与上期同期比较；取消完成删除记录 |
| TC-STA-02-1 | FR-STA-02 维度（AC） | U | stats：AC 周一完成 3 项、周三完成 2 项…… |
| TC-STA-02-2 | FR-STA-02 | U | stats：日 / 周 / 月周期与同期计算 |
| TC-STA-02-3 | FR-STA-02 / 05 | E | 统计：完成后计入日 / 周 / 月统计，明细可跳回事项 |
| TC-STA-02-4 | FR-STA-02 周趋势曲线（#34） | U | curve：单调插值，连续为 0 的两天之间平直，任何一段不超出端点 |
| TC-STA-02-5 | FR-STA-02 月日历展开某天（#35） | E | #35 月统计完成日历：点击日期展开当天完成的事项，Esc 收起，可跳到日视图 |
| TC-STA-03-1 | FR-STA-03 完成率 | U | stats：到期完成率只统计截止日期在本期内的事项 |
| TC-STA-04-1 | FR-STA-04 标签分布 | U | stats：按根标签分布，可下钻到一级子标签 |
| TC-STA-06-1 | FR-STA-06 连续天数 | U | stats：今天未完成时从昨天往前数；最长纪录跨月 |

## F9 设置

| 用例 | 需求 | 类型 | 测试 |
|---|---|---|---|
| TC-SET-01-1 | FR-SET-01 主题 | E | 主题设置同时作用于主窗口和悬浮窗，并在重启后保留 |
| TC-SET-02-1 | FR-SET-02 设置页 / 硬件加速 | E | 硬件加速为可选项：默认关闭，开启后提示重启，重启后生效 |
| TC-SET-03-1 | FR-SET-03 持久化 | U | services：设置默认值、持久化与校验 |
| TC-SET-06-1 | FR-SET-06 导出导入（AC） | U | backup：导出后导入到全新安装，数据完全一致；旧版本；非法文件 |
| TC-SET-06-2 | FR-SET-06 | E | 数据：导出备份后导入，覆盖前确认并自动备份 |
| TC-SET-07-1 | FR-SET-07 自动备份 | U | backup：每日备份每天只做一次，保留最近 7 份 |
| TC-SET-08-1 | FR-SET-08 全局快捷键 | E | 全局快捷键：默认 Ctrl+Alt+T，可录制新组合或关闭 |
| TC-SET-08-2 | FR-SET-08 | U | shortcut：校验 Accelerator；从键盘事件生成；platform：各平台默认值 |
| TC-SET-09-1 | FR-SET-09 界面音效（#37） | U | SettingsService：界面音效默认值，风格与音量校验 |
| TC-SET-09-2 | FR-SET-09 | E | #37 界面音效：新建、完成、全部完成、删除时发声；关闭后不再发声；设置中可切换风格 |
| TC-SET-09-3 | FR-SET-09 | M | M-27 真机试听各风格与音量 |
| TC-SET-10-1 | FR-SET-10 窗口背景图（#41） | U | background：设置校验（图片引用、参数范围、位置） |
| TC-SET-10-2 | FR-SET-10 | E | #41 背景图：内置背景铺满窗口、面板半透明；上传图片缩放后保存；可调参数并取消 |
| TC-SET-10-3 | FR-SET-10 | M | M-28 真实照片的可读性与窗口缩放流畅度 |
| TC-SET-10-4 | FR-SET-10 背景主色（#47） | U/E | background：主色对比度、取色、当前背景主色；#41 E2E 中切换背景后主色改变 |
| TC-IR-12-2 | IR-12 节假日覆盖年份（#46） | U/E | workdays：已包含到哪一年 / 未公布 / 缺少本年；#42 / #46 E2E |
| TC-IR-12-1 | IR-12 节假日更新时间（#42） | U/E | holidays：只在获取成功时记录更新时间；#42 设置显示上次更新时间 |

## F10 更新

| 用例 | 需求 | 类型 | 测试 |
|---|---|---|---|
| TC-UPD-01-1 | FR-UPD-01 自动检查（AC ①②） | U | update：关闭自动检查后不再发起检查；自动检查失败静默 |
| TC-UPD-02-1 | FR-UPD-02 手动检查 | E | 更新：手动检查 → 后台下载 → 就绪…… |
| TC-UPD-02-2 | FR-UPD-02（AC ②） | U | update：区分无网络、服务器不可用、安全连接与校验失败 |
| TC-UPD-03-1 | FR-UPD-03 提示 / 跳过 / 稍后 | U | update：跳过此版本后不再提示，更高版本恢复；"稍后"后本次不再通知 |
| TC-UPD-03-2 | FR-UPD-03 | E | 更新：关闭自动下载后手动下载、跳过版本…… |
| TC-UPD-04-1 | FR-UPD-04 后台下载 | U | update：发现新版本 → 下载 → 就绪；只能手动下载的平台 |
| TC-UPD-05-1 | FR-UPD-05 校验 | M | M-11 篡改安装包后更新被拒绝 |
| TC-UPD-06-1 | FR-UPD-06 安装时机 | M | M-10 rc.1 → rc.2：立即重启更新 / 退出时安装 |
| TC-UPD-07-1 | FR-UPD-07 更新前备份 | U | update：立即重启并更新前先做更新前备份，退出时不重复 |
| TC-UPD-07-2 | FR-UPD-07（AC ②） | U | recovery：迁移失败时回滚并报告，原数据保持不变 |
| TC-UPD-08-1 | FR-UPD-08 设置 | E | 更新：……关闭自动检查时"自动下载"置灰 |
| TC-UPD-09-1 | FR-UPD-09 失败处理 | E | 更新：……检查失败显示原因（前往下载页） |
| TC-UPD-10-1 | FR-UPD-10 通道 | U | update：语义化版本比较，预发布低于正式版 |
| TC-UPD-11-1 | FR-UPD-11 更新后说明 | U | update：更新后首次启动显示横幅，关闭后不再显示 |
| TC-UPD-11-2 | FR-UPD-11 更新内容（#25） | U | update：发现新版本时保存更新说明；本地没有时读取当前版本说明；Atom 订阅中按版本取说明、分隔线截止 |
| TC-IR-10-1 | IR-10 安装向导（#29） | M | M-26 安装范围、位置、桌面快捷方式可选，开始菜单快捷方式固定；更新保留位置与快捷方式 |

## 非功能需求

| 用例 | 需求 | 类型 | 测试 |
|---|---|---|---|
| TC-PERF-01-1 | NFR-PERF-01 / 02 托盘、悬浮窗内存 | P | `pnpm spike:metrics --packaged`（spike-report §1.1） |
| TC-PERF-03-1 | NFR-PERF-03 主窗口 1000 条 | P | perf.spec：冷启动、1000 条事项时的内存与勾选响应 |
| TC-PERF-04-1 | NFR-PERF-04 空闲 CPU | M | M-12 后台常驻 1 小时采样 |
| TC-PERF-05-1 | NFR-PERF-05 冷启动 | P | perf.spec |
| TC-PERF-06-1 | NFR-PERF-06 操作响应 | P | capacity（服务层）+ perf.spec（界面勾选） |
| TC-PERF-07-1 | NFR-PERF-07 容量 | P | capacity：1 万事项 / 10 万完成记录 / 500 标签 |
| TC-PERF-08-1 | NFR-PERF-08 7 天长稳 | M | M-13 |
| TC-PERF-09-1 | NFR-PERF-09 安装包 | S | 发布产物大小（spike-report §7） |
| TC-REL-01-1 | NFR-REL-01 事务 / 断电 | U | migrate：迁移失败时整体回滚；backup：导入失败回滚 |
| TC-REL-02-1 | NFR-REL-02 损坏恢复 | U | recovery：文件不是数据库时报告损坏；选择最新备份恢复 |
| TC-REL-03-1 | NFR-REL-03 迁移 | U | recovery / migrate：迁移失败回滚、拒绝降级 |
| TC-REL-04-1 | NFR-REL-04 崩溃恢复 | M | M-14 结束渲染进程后自动重新加载 |
| TC-REL-04-2 | NFR-REL-04 界面不白屏 | E + P | rc.1 反馈：快速切换视图不会白屏；随机交互测试（FUZZ=1，7 个种子 × 700 步） |
| TC-REL-05-1 | NFR-REL-05 更新失败可用 | M | M-10 / M-11 |
| TC-SEC-02-1 | NFR-SEC-02 隔离与校验 | E | 渲染进程拿不到 Node，主进程拒绝不合法的输入 |
| TC-SEC-03-1 | NFR-SEC-03 导入校验 | U | backup：文件不合法时拒绝导入，当前数据不变 |
| TC-SEC-04-1 | NFR-SEC-04 不降级 | U | update：版本比较；recovery：数据来自更新版本时拒绝打开 |
| TC-USE-02-1 | NFR-USE-02 对比度 | U | `python design/scripts/check_contrast.py`（77 组）；悬浮窗色带见设计系统 §7.5 |
| TC-USE-03-1 | NFR-USE-03 焦点 / 读屏 | E + M | 下拉选择：支持键盘；M-15 讲述人读出单选框状态 |
| TC-USE-04-1 | NFR-USE-04 减少动画 | M | M-16 |
| TC-USE-05-1 | NFR-USE-05 缩放 | M | M-04 100%–200% 缩放 |
| TC-POR-01-1 | NFR-POR-01 多平台 | S + U | CI macOS / Linux 打包冒烟；platform：快捷键与默认值 |
