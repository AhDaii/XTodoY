# XTodoY

轻量、常驻后台的桌面待办软件：记下要做的事，到点提醒，桌面上随时能看到今天还剩几件。

- 待办事项、日期时间与循环规则，单选框手动勾选完成
- 提醒通过系统通知推送，可直接「完成」或「稍后提醒」；休眠错过的提醒唤醒后补发
- 多级标签与标签管理，按标签分类浏览
- 低 CPU / 内存占用的托盘常驻；桌面悬浮窗显示今天日期与未完成数，单击回到主界面
- 每天 / 每周 / 每月完成统计
- 浅色 / 深色 / 跟随系统主题；数据仅保存在本机，自动备份；自动更新

## 下载

到 [Releases](https://github.com/AhDaii/XTodoY/releases) 下载：Windows 10 / 11（主要平台）、macOS 12+、Linux（AppImage / deb）。安装与使用说明见 [用户手册](docs/user-guide.md)，版本变化见 [更新日志](CHANGELOG.md)。

技术栈：Electron + electron-vite + React + TypeScript + SQLite（better-sqlite3）

## 文档

- [项目规划](docs/PROJECT_PLAN.md)
- [用户手册](docs/user-guide.md) · [更新日志](CHANGELOG.md)
- [软件需求规格说明书（SRS）](docs/srs/SRS.md)（v1.1.3）
- [测试计划与报告](docs/test/test-plan.md) · [需求追踪矩阵](docs/test/traceability.md) · [人工测试清单](docs/test/manual-checklist.md)
- [设计系统](design/design-system.md) 与 [设计令牌](design/tokens.css)（P2，使用 ui-ux-pro-max 设计）
- 交互原型：运行 `python design/scripts/serve.py` 后打开 http://127.0.0.1:5178/prototype/index.html

## 开发

需要 Node.js 24+ 与 pnpm 12。

```bash
pnpm install        # 安装依赖
pnpm dev            # 开发模式启动
pnpm test           # 单元测试
pnpm build && pnpm test:e2e   # 端到端测试
pnpm test:perf      # 容量与性能测试（1 万条事项）
pnpm dist           # 打包当前平台的安装包到 release/
```

架构与接口见 [docs/design/](docs/design/)。

## 状态

v1.0.0-rc.1：第一个候选版本，正在按 [人工测试清单](docs/test/manual-checklist.md) 验证，之后发布 v1.0.0。
