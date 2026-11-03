-- XTodoY 初始数据库结构（docs/design/database.md §2）
CREATE TABLE todos (
  id                TEXT PRIMARY KEY,
  title             TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  note              TEXT NOT NULL DEFAULT '',
  due_date          TEXT,
  due_time          TEXT,
  rrule             TEXT,
  rrule_month_day   INTEGER,
  repeat_count_done INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  completed_at      INTEGER,
  priority          INTEGER NOT NULL DEFAULT 0 CHECK (priority BETWEEN 0 AND 3),
  sort_key          TEXT NOT NULL,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  deleted_at        INTEGER
);
CREATE INDEX idx_todos_status_due ON todos (status, due_date) WHERE deleted_at IS NULL;
CREATE INDEX idx_todos_deleted ON todos (deleted_at);
CREATE INDEX idx_todos_sort ON todos (sort_key);

CREATE TABLE tags (
  id        TEXT PRIMARY KEY,
  parent_id TEXT REFERENCES tags (id) ON DELETE RESTRICT,
  name      TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 30),
  color     TEXT NOT NULL,
  sort_key  TEXT NOT NULL,
  path      TEXT NOT NULL,
  depth     INTEGER NOT NULL CHECK (depth BETWEEN 0 AND 4)
);
CREATE UNIQUE INDEX uq_tags_sibling_name ON tags (IFNULL(parent_id, ''), name COLLATE NOCASE);
CREATE INDEX idx_tags_path ON tags (path);

CREATE TABLE todo_tags (
  todo_id TEXT NOT NULL REFERENCES todos (id) ON DELETE CASCADE,
  tag_id  TEXT NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
  PRIMARY KEY (todo_id, tag_id)
);
CREATE INDEX idx_todo_tags_tag ON todo_tags (tag_id);

CREATE TABLE reminders (
  id             TEXT PRIMARY KEY,
  todo_id        TEXT NOT NULL REFERENCES todos (id) ON DELETE CASCADE,
  kind           TEXT NOT NULL CHECK (kind IN ('relative', 'absolute')),
  offset_minutes INTEGER,
  fire_at_abs    INTEGER,
  next_fire_at   INTEGER,
  fired_at       INTEGER,
  snoozed_until  INTEGER
);
CREATE UNIQUE INDEX uq_reminders_rule ON reminders (todo_id, kind, IFNULL(offset_minutes, -1), IFNULL(fire_at_abs, -1));
CREATE INDEX idx_reminders_next ON reminders (next_fire_at) WHERE next_fire_at IS NOT NULL;

CREATE TABLE completion_logs (
  id                   TEXT PRIMARY KEY,
  todo_id              TEXT REFERENCES todos (id) ON DELETE CASCADE,
  occurrence_date      TEXT,
  completed_at         INTEGER NOT NULL,
  completed_local_date TEXT NOT NULL,
  completed_local_hour INTEGER NOT NULL,
  title_snapshot       TEXT NOT NULL,
  root_tag_id          TEXT
);
CREATE INDEX idx_logs_local_date ON completion_logs (completed_local_date);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
