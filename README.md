# XTodoY

轻量、常驻后台的 PC 桌面待办软件。

- 待办事项记录，单选框手动勾选完成
- 事项时间与循环规则，可设置提醒时间，通过系统通知提醒
- 多级标签与标签管理，按标签分类浏览
- 低 CPU / 内存占用的托盘常驻，悬浮窗显示今日待办数量，点击回到主界面
- 每天 / 每周 / 每月完成统计
- 浅色 / 深色 / 跟随系统主题

技术栈（规划）：Electron + electron-vite + React + TypeScript + Tailwind CSS + SQLite（better-sqlite3）

## 文档

- [项目规划](docs/PROJECT_PLAN.md)
- [软件需求规格说明书（SRS）](docs/srs/SRS.md)（v1.1 已定稿）
- [设计系统](design/design-system.md) 与 [设计令牌](design/tokens.css)（P2，使用 ui-ux-pro-max 设计）
- 交互原型：运行 `python design/scripts/serve.py` 后打开 http://127.0.0.1:5178/prototype/index.html

## 开发

需要 Node.js 24+ 与 pnpm 12。

```bash
pnpm install        # 安装依赖
pnpm dev            # 开发模式启动
pnpm test           # 单元测试
pnpm build && pnpm test:e2e   # 端到端测试
pnpm dist           # 打包 Windows 安装包到 release/
```

架构与接口见 [docs/design/](docs/design/)。

## 状态

当前处于 P5 阶段：循环事项、提醒与系统通知、暂停提醒、开机自启、悬浮窗菜单已可用，下一步进入 P6（统计、备份、自动更新与打磨）。
