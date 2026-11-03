import { generateKeyBetween } from 'fractional-indexing';
import { advanceAfterComplete, fromRRule, toRRule, type RepeatRule } from '@shared/recurrence';
import {
  LIMITS,
  type ListQuery,
  type Priority,
  type ReminderSpec,
  type Settings,
  type Todo,
  type TodoCreate,
  type TodoGroup,
  type TodoPatch,
  type ViewCounts,
} from '@shared/types';
import type { DB } from '../db/client';
import { uuidv7 } from '../domain/ids';
import { localDate } from '../domain/time';
import { byDue, comparator, groupForView } from '../domain/views';
import { bus } from '../events/bus';
import { AppError, invalid, notFound } from './errors';
import type { TagService } from './tags';
import { UndoStore } from './undo';

interface TodoRow {
  id: string;
  title: string;
  note: string;
  due_date: string | null;
  due_time: string | null;
  priority: Priority;
  status: 'open' | 'done';
  completed_at: number | null;
  sort_key: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
  rrule: string | null;
  repeat_anchor: string | null;
  repeat_count_done: number;
}

interface ReminderRow {
  id: string;
  todo_id: string;
  kind: 'relative' | 'absolute';
  offset_minutes: number | null;
  fire_at_abs: number | null;
  next_fire_at: number | null;
}

type TodoSettings = Pick<Settings, 'weekStart' | 'defaultReminder'> & Partial<Pick<Settings, 'listSort'>>;

const DAY_MS = 86_400_000;

/** 待办服务（FR-TODO）：所有写操作在主进程完成，完成后发出 todos.changed */
export class TodoService {
  readonly undoStore = new UndoStore();

  constructor(
    private readonly db: DB,
    private readonly tags: TagService,
    private readonly settings: () => TodoSettings,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private today(): string {
    return localDate(this.now());
  }

  // ---------- 查询 ----------

  private hydrate(rows: TodoRow[]): Todo[] {
    if (!rows.length) return [];
    const display = this.tags.displayMap();
    const links = this.db
      .prepare(
        `SELECT todo_id, tag_id FROM todo_tags WHERE todo_id IN (SELECT value FROM json_each(?))
         ORDER BY rowid`,
      )
      .all(JSON.stringify(rows.map((r) => r.id))) as { todo_id: string; tag_id: string }[];
    const tagsOf = new Map<string, Todo['tags']>();
    for (const l of links) {
      const t = display.get(l.tag_id);
      if (!t) continue;
      tagsOf.set(l.todo_id, [
        ...(tagsOf.get(l.todo_id) ?? []),
        { id: l.tag_id, name: t.name, color: t.color, path: t.displayPath },
      ]);
    }
    const reminderRows = this.db
      .prepare(
        `SELECT * FROM reminders WHERE todo_id IN (SELECT value FROM json_each(?))
         ORDER BY kind, offset_minutes, fire_at_abs`,
      )
      .all(JSON.stringify(rows.map((r) => r.id))) as ReminderRow[];
    const remindersOf = new Map<string, Todo['reminders']>();
    for (const r of reminderRows) {
      const spec: ReminderSpec =
        r.kind === 'absolute'
          ? { kind: 'absolute', at: r.fire_at_abs! }
          : { kind: 'relative', offsetMinutes: r.offset_minutes! };
      remindersOf.set(r.todo_id, [
        ...(remindersOf.get(r.todo_id) ?? []),
        { id: r.id, spec, nextFireAt: r.next_fire_at },
      ]);
    }
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      note: r.note,
      dueDate: r.due_date,
      dueTime: r.due_time,
      priority: r.priority,
      status: r.status,
      completedAt: r.completed_at,
      sortKey: r.sort_key,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      deletedAt: r.deleted_at,
      tags: tagsOf.get(r.id) ?? [],
      rrule: r.rrule,
      repeatAnchor: r.repeat_anchor,
      repeatCountDone: r.repeat_count_done,
      reminders: remindersOf.get(r.id) ?? [],
    }));
  }

  get(id: string): Todo {
    const row = this.db.prepare('SELECT * FROM todos WHERE id = ?').get(id) as TodoRow | undefined;
    if (!row) throw notFound('待办');
    return this.hydrate([row])[0]!;
  }

  list(q: ListQuery): TodoGroup[] {
    if (q.search) {
      const like = `%${q.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      const rows = this.db
        .prepare(
          `SELECT * FROM todos WHERE deleted_at IS NULL
           AND (title LIKE ? ESCAPE '\\' OR note LIKE ? ESCAPE '\\')
           ORDER BY status, due_date IS NULL, due_date LIMIT 500`,
        )
        .all(like, like) as TodoRow[];
      return [{ id: 'search', title: null, items: this.hydrate(rows).sort(byDue) }];
    }
    if (q.tagId) {
      const tag = this.db.prepare('SELECT path FROM tags WHERE id = ?').pluck().get(q.tagId) as string | undefined;
      if (!tag) throw notFound('标签');
      const rows = this.db
        .prepare(
          `SELECT DISTINCT t.* FROM todos t
           JOIN todo_tags tt ON tt.todo_id = t.id
           JOIN tags g ON g.id = tt.tag_id
           WHERE t.deleted_at IS NULL ${q.showDone ? '' : "AND t.status = 'open'"}
             AND ${q.includeChildren === false ? 'g.id = ?' : "g.path LIKE ? || '%'"}`,
        )
        .all(q.includeChildren === false ? q.tagId : tag) as TodoRow[];
      const items = this.hydrate(rows);
      const open = items.filter((t) => t.status === 'open').sort(comparator(this.settings().listSort?.tag));
      if (!q.showDone) return [{ id: 'tag', title: null, items: open }];
      // 显示已完成（FR-TAG-04）：放在可折叠的分组里，按完成时间倒序
      const done = items.filter((t) => t.status === 'done').sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
      return [
        { id: 'tag', title: null, items: open },
        { id: 'tag-done', title: '已完成', collapsible: true, items: done },
      ];
    }
    const view = q.view ?? 'today';
    const where = {
      today: 'deleted_at IS NULL AND due_date = @today',
      plan: "deleted_at IS NULL AND status = 'open' AND due_date IS NOT NULL",
      all: "deleted_at IS NULL AND status = 'open'",
      done: "deleted_at IS NULL AND status = 'done'",
      trash: 'deleted_at IS NOT NULL',
    }[view];
    const rows = this.db.prepare(`SELECT * FROM todos WHERE ${where}`).all({ today: this.today() }) as TodoRow[];
    const sort = view === 'done' || view === 'trash' ? 'due' : this.settings().listSort?.[view];
    return groupForView(view, this.hydrate(rows), this.today(), this.settings().weekStart, sort);
  }

  counts(): ViewCounts {
    const r = this.db
      .prepare(
        `SELECT
           SUM(deleted_at IS NULL AND status = 'open' AND due_date = @today) AS today,
           SUM(deleted_at IS NULL AND status = 'open' AND due_date IS NOT NULL) AS plan,
           SUM(deleted_at IS NULL AND status = 'open') AS "all",
           SUM(deleted_at IS NULL AND status = 'done') AS done,
           SUM(deleted_at IS NOT NULL) AS trash,
           SUM(deleted_at IS NULL AND status = 'open' AND due_date < @today) AS overdue
         FROM todos`,
      )
      .get({ today: this.today() }) as Record<keyof ViewCounts, number | null>;
    return {
      today: r.today ?? 0,
      plan: r.plan ?? 0,
      all: r.all ?? 0,
      done: r.done ?? 0,
      trash: r.trash ?? 0,
      overdue: r.overdue ?? 0,
    };
  }

  // ---------- 写操作 ----------

  create(input: TodoCreate): Todo {
    const id = uuidv7();
    const now = Date.now();
    const first = this.db.prepare('SELECT MIN(sort_key) FROM todos').pluck().get() as string | null;
    const tagIds = input.tagIds ?? [];
    this.assertTags(tagIds);
    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO todos (id, title, due_date, due_time, priority, sort_key, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          input.title,
          input.dueDate ?? null,
          input.dueDate ? (input.dueTime ?? null) : null,
          input.priority ?? 0,
          generateKeyBetween(null, first),
          now,
          now,
        );
      const link = this.db.prepare('INSERT INTO todo_tags (todo_id, tag_id) VALUES (?, ?)');
      for (const t of tagIds) link.run(id, t);
      if (input.dueDate && input.dueTime) this.addDefaultReminder(id);
    });
    tx();
    this.changed(id);
    return this.get(id);
  }

  private addDefaultReminder(id: string): void {
    const m = this.settings().defaultReminder;
    if (m < 0) return;
    this.db
      .prepare("INSERT OR IGNORE INTO reminders (id, todo_id, kind, offset_minutes) VALUES (?, ?, 'relative', ?)")
      .run(uuidv7(), id, m);
  }

  update(id: string, patch: TodoPatch): Todo {
    const cur = this.get(id);
    const dueDate = patch.dueDate !== undefined ? patch.dueDate : cur.dueDate;
    // 清除日期时一并清除时间；未设日期时不能单独设时间
    let dueTime = patch.dueTime !== undefined ? patch.dueTime : cur.dueTime;
    if (!dueDate) dueTime = null;
    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE todos SET title = ?, note = ?, due_date = ?, due_time = ?, priority = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(
          patch.title ?? cur.title,
          patch.note ?? cur.note,
          dueDate,
          dueTime,
          patch.priority ?? cur.priority,
          Date.now(),
          id,
        );
      if (!dueDate && cur.dueDate) {
        // 循环与相对提醒都依赖截止日期（FR-REC-02、FR-REM-01）
        this.db.prepare('UPDATE todos SET rrule = NULL, repeat_anchor = NULL WHERE id = ?').run(id);
        this.db.prepare("DELETE FROM reminders WHERE todo_id = ? AND kind = 'relative'").run(id);
      } else if (dueTime && !cur.dueTime && cur.reminders.length === 0) {
        this.addDefaultReminder(id);
      }
      // 循环事项手动改日期时，以新日期作为新的起点
      if (dueDate && cur.rrule && dueDate !== cur.dueDate) {
        this.db.prepare('UPDATE todos SET repeat_anchor = ? WHERE id = ?').run(dueDate, id);
      }
    });
    tx();
    this.changed(id);
    return this.get(id);
  }

  /** 设置 / 取消循环（FR-REC-02/07）：没有截止日期时以今天为首个实例 */
  setRepeat(id: string, rule: RepeatRule | null): Todo {
    const cur = this.get(id);
    const due = cur.dueDate ?? this.today();
    this.db
      .prepare(
        'UPDATE todos SET rrule = ?, repeat_anchor = ?, due_date = ?, repeat_count_done = 0, updated_at = ? WHERE id = ?',
      )
      .run(rule ? toRRule(rule) : null, rule ? due : null, rule ? due : cur.dueDate, Date.now(), id);
    this.changed(id);
    return this.get(id);
  }

  /** 设置提醒（FR-REM-01）：整体替换；相对提醒需要截止日期 */
  setReminders(id: string, specs: ReminderSpec[]): Todo {
    const cur = this.get(id);
    if (specs.length > LIMITS.remindersPerTodo) throw invalid(`每个待办最多 ${LIMITS.remindersPerTodo} 个提醒`);
    if (!cur.dueDate && specs.some((r) => r.kind === 'relative')) throw invalid('相对提醒需要先设置截止日期');
    const key = (r: ReminderSpec): string => (r.kind === 'absolute' ? `a${r.at}` : `r${r.offsetMinutes}`);
    if (new Set(specs.map(key)).size !== specs.length) throw invalid('有重复的提醒');
    const tx = this.db.transaction(() => {
      // 保留未变化的提醒（连同触发状态），只增删有变化的
      const existing = this.db.prepare('SELECT * FROM reminders WHERE todo_id = ?').all(id) as ReminderRow[];
      const keep = new Set(specs.map(key));
      const del = this.db.prepare('DELETE FROM reminders WHERE id = ?');
      const have = new Set<string>();
      for (const r of existing) {
        const k = r.kind === 'absolute' ? `a${r.fire_at_abs}` : `r${r.offset_minutes}`;
        if (keep.has(k)) have.add(k);
        else del.run(r.id);
      }
      const ins = this.db.prepare(
        'INSERT INTO reminders (id, todo_id, kind, offset_minutes, fire_at_abs) VALUES (?, ?, ?, ?, ?)',
      );
      for (const r of specs) {
        if (have.has(key(r))) continue;
        ins.run(
          uuidv7(),
          id,
          r.kind,
          r.kind === 'relative' ? r.offsetMinutes : null,
          r.kind === 'absolute' ? r.at : null,
        );
      }
      this.db.prepare('UPDATE todos SET updated_at = ? WHERE id = ?').run(Date.now(), id);
    });
    tx();
    this.changed(id);
    return this.get(id);
  }

  /** 循环事项"跳过本次"（FR-REC-06）：前进到下一次实例，不写完成记录 */
  skip(id: string): { todo: Todo; undoToken: string } {
    const cur = this.get(id);
    if (!cur.rrule || !cur.dueDate) throw invalid('只有循环事项可以跳过本次');
    const rule = fromRRule(cur.rrule);
    const next = advanceAfterComplete(
      rule,
      cur.repeatAnchor ?? cur.dueDate,
      cur.dueDate,
      this.today(),
      cur.repeatCountDone,
    );
    if (!next) throw new AppError('REPEAT_ENDED', '这是最后一次，无法跳过');
    this.db.prepare('UPDATE todos SET due_date = ?, updated_at = ? WHERE id = ?').run(next, Date.now(), id);
    this.changed(id);
    const undoToken = this.undoStore.add(() => {
      this.db.prepare('UPDATE todos SET due_date = ? WHERE id = ?').run(cur.dueDate, id);
      this.changed(id);
    });
    return { todo: this.get(id), undoToken };
  }

  /** 勾选完成 / 取消完成（FR-TODO-03）：完成时写完成记录，取消时删除最近一条完成记录 */
  toggle(id: string): { todo: Todo; undoToken: string } {
    const cur = this.get(id);
    if (cur.deletedAt) throw new AppError('DELETED', '已删除的待办不能勾选');
    const now = this.now();
    if (cur.status === 'open' && cur.rrule && cur.dueDate) return this.completeOccurrence(cur, now);
    const tx = this.db.transaction(() => {
      if (cur.status === 'open') {
        this.db
          .prepare("UPDATE todos SET status = 'done', completed_at = ?, updated_at = ? WHERE id = ?")
          .run(now.getTime(), now.getTime(), id);
        this.writeLog(cur, now);
      } else {
        this.db
          .prepare("UPDATE todos SET status = 'open', completed_at = NULL, updated_at = ? WHERE id = ?")
          .run(now.getTime(), id);
        this.db
          .prepare(
            `DELETE FROM completion_logs WHERE id =
             (SELECT id FROM completion_logs WHERE todo_id = ? ORDER BY completed_at DESC LIMIT 1)`,
          )
          .run(id);
      }
    });
    tx();
    this.changed(id);
    const undoToken = this.undoStore.add(() => this.toggle(id));
    return { todo: this.get(id), undoToken };
  }

  /** 循环事项完成本次：写完成记录，日期前进到下一次；没有下一次时整体完成 */
  private completeOccurrence(cur: Todo, now: Date): { todo: Todo; undoToken: string } {
    const rule = fromRRule(cur.rrule!);
    const done = cur.repeatCountDone + 1;
    const next = advanceAfterComplete(rule, cur.repeatAnchor ?? cur.dueDate!, cur.dueDate!, localDate(now), done);
    let logId = '';
    const tx = this.db.transaction(() => {
      logId = this.writeLog(cur, now);
      if (next) {
        this.db
          .prepare('UPDATE todos SET due_date = ?, repeat_count_done = ?, updated_at = ? WHERE id = ?')
          .run(next, done, now.getTime(), cur.id);
      } else {
        this.db
          .prepare(
            "UPDATE todos SET status = 'done', completed_at = ?, repeat_count_done = ?, updated_at = ? WHERE id = ?",
          )
          .run(now.getTime(), done, now.getTime(), cur.id);
      }
    });
    tx();
    this.changed(cur.id);
    const undoToken = this.undoStore.add(() => {
      const undo = this.db.transaction(() => {
        this.db
          .prepare(
            "UPDATE todos SET status = 'open', completed_at = NULL, due_date = ?, repeat_count_done = ? WHERE id = ?",
          )
          .run(cur.dueDate, cur.repeatCountDone, cur.id);
        this.db.prepare('DELETE FROM completion_logs WHERE id = ?').run(logId);
      });
      undo();
      this.changed(cur.id);
    });
    return { todo: this.get(cur.id), undoToken };
  }

  private writeLog(cur: Todo, now: Date): string {
    const id = uuidv7();
    const rootTag = cur.tags[0]
      ? (this.db.prepare('SELECT path FROM tags WHERE id = ?').pluck().get(cur.tags[0].id) as string)
          .split('/')
          .filter(Boolean)[0]
      : null;
    this.db
      .prepare(
        `INSERT INTO completion_logs
             (id, todo_id, occurrence_date, completed_at, completed_local_date, completed_local_hour, title_snapshot, root_tag_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, cur.id, cur.dueDate, now.getTime(), localDate(now), now.getHours(), cur.title, rootTag ?? null);
    return id;
  }

  /** 删除进回收站（D-7），可撤销 */
  remove(id: string): { undoToken: string } {
    this.get(id);
    this.db.prepare('UPDATE todos SET deleted_at = ?, updated_at = ? WHERE id = ?').run(Date.now(), Date.now(), id);
    this.changed(id);
    return { undoToken: this.undoStore.add(() => this.restore(id)) };
  }

  restore(id: string): void {
    this.db.prepare('UPDATE todos SET deleted_at = NULL, updated_at = ? WHERE id = ?').run(Date.now(), id);
    this.changed(id);
  }

  /** 永久删除：完成记录随外键级联删除（DR-04） */
  purge(id: string): void {
    this.db.prepare('DELETE FROM todos WHERE id = ? AND deleted_at IS NOT NULL').run(id);
    this.changed(id);
  }

  purgeAll(): void {
    this.db.prepare('DELETE FROM todos WHERE deleted_at IS NOT NULL').run();
    this.changed();
  }

  /** 启动时清理回收站中超过 30 天的事项（DR-03） */
  purgeExpired(): number {
    const cutoff = Date.now() - LIMITS.trashDays * DAY_MS;
    const n = this.db.prepare('DELETE FROM todos WHERE deleted_at IS NOT NULL AND deleted_at < ?').run(cutoff).changes;
    if (n) this.changed();
    return n;
  }

  undo(token: string): void {
    if (!this.undoStore.undo(token)) throw new AppError('UNDO_EXPIRED', '已超过可撤销的时间');
  }

  /** 手动排序：放到 afterId 与 beforeId 之间（FR-TODO-06） */
  reorder(id: string, afterId: string | null, beforeId: string | null): void {
    const key = (x: string | null): string | null =>
      x
        ? ((this.db.prepare('SELECT sort_key FROM todos WHERE id = ?').pluck().get(x) as string | undefined) ?? null)
        : null;
    const lo = key(afterId);
    const hi = key(beforeId);
    if (lo && hi && lo >= hi) throw invalid('排序位置不正确');
    this.db.prepare('UPDATE todos SET sort_key = ? WHERE id = ?').run(generateKeyBetween(lo, hi), id);
    this.changed(id);
  }

  setTags(id: string, tagIds: string[]): Todo {
    this.get(id);
    this.assertTags(tagIds);
    const tx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM todo_tags WHERE todo_id = ?').run(id);
      const link = this.db.prepare('INSERT INTO todo_tags (todo_id, tag_id) VALUES (?, ?)');
      for (const t of tagIds) link.run(id, t);
      this.db.prepare('UPDATE todos SET updated_at = ? WHERE id = ?').run(Date.now(), id);
    });
    tx();
    this.changed(id);
    bus.emit('tags.changed');
    return this.get(id);
  }

  private assertTags(tagIds: string[]): void {
    if (tagIds.length > LIMITS.tagsPerTodo) throw invalid(`每个待办最多 ${LIMITS.tagsPerTodo} 个标签`);
    if (!tagIds.length) return;
    const n = this.db
      .prepare('SELECT COUNT(*) FROM tags WHERE id IN (SELECT value FROM json_each(?))')
      .pluck()
      .get(JSON.stringify(tagIds)) as number;
    if (n !== tagIds.length) throw notFound('标签');
  }

  private changed(id?: string): void {
    bus.emit('todos.changed', id ? [id] : undefined);
  }
}
