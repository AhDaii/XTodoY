# XTodoY 数据库设计

> 依据：SRS §6 数据需求、FR-TODO / REC / REM / TAG / STA / UPD · 实现：`migrations/*.sql` + `src/main/services/*.ts`（better-sqlite3 预编译语句）

## 1 总体

- 引擎：SQLite（better-sqlite3），单文件 `%APPDATA%\XTodoY\xtodoy.db`。
- 连接参数：`journal_mode = WAL`、`synchronous = NORMAL`、`foreign_keys = ON`、`busy_timeout = 3000`。WAL + NORMAL 在断电时最多丢失最后一个事务，满足 NFR-REL-01。
- 主键：`TEXT`，使用 UUIDv7（时间有序，便于导入导出与未来同步）。
- 时间：
  - 日期字段 `TEXT 'YYYY-MM-DD'`（本地日期，FR-REC-08）。
  - 时刻字段 `INTEGER`，Unix 毫秒（UTC）；显示时按本地时区转换。
  - 时间（时分）字段 `TEXT 'HH:mm'`。
- 软删除：`deleted_at INTEGER NULL`（D-7）。

## 2 表结构

### 2.1 `todos`

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PK | |
| title | TEXT | NOT NULL, 1–200 字符 | |
| note | TEXT | NOT NULL DEFAULT '' | |
| due_date | TEXT | NULL | 无日期事项为 NULL |
| due_time | TEXT | NULL | NULL 表示全天 |
| rrule | TEXT | NULL | RFC 5545 RRULE；NULL 表示不循环 |
| rrule_month_day | INTEGER | NULL | 每月指定日（1–31 或 -1 表示最后一天），用于月末规则 FR-REC-04 |
| repeat_count_done | INTEGER | NOT NULL DEFAULT 0 | 已完成次数，用于"重复 N 次后结束" |
| status | TEXT | NOT NULL CHECK IN ('open','done') | |
| completed_at | INTEGER | NULL | |
| priority | INTEGER | NOT NULL DEFAULT 0 | 0 无 / 1 低 / 2 中 / 3 高 |
| sort_key | TEXT | NOT NULL | 分数索引（fractional index），手动拖拽排序只改一行 |
| created_at / updated_at | INTEGER | NOT NULL | |
| deleted_at | INTEGER | NULL | 回收站 |

索引：`(status, due_date) WHERE deleted_at IS NULL`（今天 / 计划视图）、`(deleted_at)`（回收站清理）、`(sort_key)`。

### 2.2 `tags`

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PK | |
| parent_id | TEXT | NULL, FK → tags.id ON DELETE RESTRICT | 删除由服务层按 D-5 处理 |
| name | TEXT | NOT NULL, 1–30 字符 | |
| color | TEXT | NOT NULL | 12 色之一（`teal` … `slate`） |
| sort_key | TEXT | NOT NULL | 同级排序 |
| path | TEXT | NOT NULL | 物化路径 `/<id>/<id>/`，用于"含子标签"查询 |
| depth | INTEGER | NOT NULL CHECK depth BETWEEN 0 AND 4 | 最多 5 级（D-6） |

约束：`UNIQUE (parent_id, name COLLATE NOCASE)`（根级用表达式索引 `IFNULL(parent_id,'')`）。索引：`(path)`。

移动标签时在一个事务内用 `REPLACE(path, 旧前缀, 新前缀)` 批量更新子孙的 `path` 与 `depth`，并校验最大深度。

### 2.3 `todo_tags`

| 列 | 类型 | 约束 |
|---|---|---|
| todo_id | TEXT | FK → todos.id ON DELETE CASCADE |
| tag_id | TEXT | FK → tags.id ON DELETE CASCADE |

主键 `(todo_id, tag_id)`；索引 `(tag_id)`。单事项最多 10 个标签由服务层校验。

"标签及其子标签下的事项"查询：

```sql
SELECT DISTINCT t.* FROM todos t
JOIN todo_tags tt ON tt.todo_id = t.id
JOIN tags g ON g.id = tt.tag_id
WHERE g.path LIKE :tagPath || '%' AND t.deleted_at IS NULL AND t.status = 'open';
```

### 2.4 `reminders`

| 列 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | |
| todo_id | TEXT FK → todos ON DELETE CASCADE | |
| kind | TEXT CHECK IN ('relative','absolute') | |
| offset_minutes | INTEGER NULL | 相对提醒：提前分钟数（0 = 准时） |
| fire_at_abs | INTEGER NULL | 绝对提醒时刻 |
| next_fire_at | INTEGER NULL | 下一次触发时刻（调度器用；按事项当前实例计算） |
| fired_at | INTEGER NULL | 最近一次触发 |
| snoozed_until | INTEGER NULL | 稍后提醒 |

索引：`(next_fire_at) WHERE next_fire_at IS NOT NULL`。约束：同一事项 `(todo_id, kind, offset_minutes, fire_at_abs)` 唯一；每事项 ≤ 5 条（服务层）。

### 2.5 `completion_logs`（统计数据源，FR-STA-01，DR-01）

| 列 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | |
| todo_id | TEXT NULL | 事项被永久删除时级联删除（DR-04） |
| occurrence_date | TEXT NULL | 循环事项本次实例日期 |
| completed_at | INTEGER NOT NULL | |
| completed_local_date | TEXT NOT NULL | 完成时的本地日期，统计按它归属（D-10） |
| completed_local_hour | INTEGER NOT NULL | 日视图小时分布 |
| title_snapshot | TEXT NOT NULL | |
| root_tag_id | TEXT NULL | 完成时的第一个根标签快照，用于标签分布 |

索引：`(completed_local_date)`。日 / 周 / 月统计都是对这个索引的范围扫描 + `GROUP BY`，10 万条记录下 < 50 ms（NFR-PERF-06 预算 500 ms）。

### 2.6 `settings`

键值表：`key TEXT PK, value TEXT NOT NULL`（JSON 编码）。包含主题、提醒默认值、悬浮窗位置、更新状态（DR-07：上次检查时间、跳过的版本、通道）等。

`hardwareAcceleration` 是唯一在 app ready **之前**读取的键：此时设置服务尚未创建，由 `src/main/app/launch-prefs.ts` 以只读方式直接打开数据库读取；库不存在或读取失败时视为关闭。

### 2.7 `meta`

`schema_version`、`created_with_app_version`、`last_backup_date`。

## 3 迁移策略（NFR-REL-03）

1. 迁移为手写的带序号 SQL 文件（`migrations/0001_init.sql` …），通过 Vite `?raw` 打包进主进程。P4 决定不引入 Drizzle：表结构稳定、查询以聚合和物化路径为主，手写 SQL 更直接，也少一个依赖。
2. 启动时比较 `PRAGMA user_version` 与最新迁移号；需要迁移时：
   1. 先把数据库文件复制为 `backups/pre-migrate-<from>-<to>-<时间>.db`；
   2. 在 **一个事务** 内依次执行迁移并更新 `user_version`；
   3. 失败则回滚事务（SQLite DDL 可回滚），恢复文件不变，提示用户并以只读模式运行或退出。
3. 迁移只允许"向前"；不支持降级（与 NFR-SEC-04 一致）。

## 4 备份

| 类型 | 时机 | 保留 | 方式 |
|---|---|---|---|
| 每日备份 | 每天首次启动 | 最近 7 份（DR-05） | `db.backup()`（在线备份 API，不阻塞） |
| 迁移前备份 | 执行迁移前 | 最近 2 份 | 同上 |
| 更新前备份 | 安装更新前（FR-UPD-07） | 最近 2 份 | 同上 |
| 导出 | 用户手动 | — | JSON（DR-06） |

## 5 典型查询的性能预期

| 查询 | 使用索引 | 预期（1 万事项） |
|---|---|---|
| 今天视图 / 今日计数 | `(status, due_date)` | < 5 ms |
| 计划视图 | `(status, due_date)` | < 10 ms |
| 标签视图（含子标签） | `tags(path)` + `todo_tags(tag_id)` | < 10 ms |
| 搜索 | 全表扫描 `LIKE` | < 50 ms；超过 5 万条时引入 FTS5 |
| 统计 | `completion_logs(completed_local_date)` | < 50 ms |
| 调度器装载 | `reminders(next_fire_at)` | < 5 ms |
