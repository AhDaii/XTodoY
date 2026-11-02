import { generateKeyBetween } from 'fractional-indexing';
import {
  LIMITS,
  type ListQuery,
  type Priority,
  type Todo,
  type TodoCreate,
  type TodoGroup,
  type TodoPatch,
  type ViewCounts,
} from '@shared/types';
import type { DB } from '../db/client';
import { uuidv7 } from '../domain/ids';
import { localDate } from '../domain/time';
import { byDue, groupForView } from '../domain/views';
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
}

const DAY_MS = 86_400_000;

/** 待办服务（FR-TODO）：所有写操作在主进程完成，完成后发出 todos.changed */
export class TodoService {
  readonly undoStore = new UndoStore();

  constructor(
    private readonly db: DB,
    private readonly tags: TagService,
    private readonly settings: () => { weekStart: 0 | 1 },
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
           WHERE t.deleted_at IS NULL AND t.status = 'open'
             AND ${q.includeChildren === false ? 'g.id = ?' : "g.path LIKE ? || '%'"}`,
        )
        .all(q.includeChildren === false ? q.tagId : tag) as TodoRow[];
      return [{ id: 'tag', title: null, items: this.hydrate(rows).sort(byDue) }];
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
    return groupForView(view, this.hydrate(rows), this.today(), this.settings().weekStart);
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
    });
    tx();
    this.changed(id);
    return this.get(id);
  }

  update(id: string, patch: TodoPatch): Todo {
    const cur = this.get(id);
    const dueDate = patch.dueDate !== undefined ? patch.dueDate : cur.dueDate;
    // 清除日期时一并清除时间；未设日期时不能单独设时间
    let dueTime = patch.dueTime !== undefined ? patch.dueTime : cur.dueTime;
    if (!dueDate) dueTime = null;
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
    this.changed(id);
    return this.get(id);
  }

  /** 勾选完成 / 取消完成（FR-TODO-03）：完成时写完成记录，取消时删除最近一条完成记录 */
  toggle(id: string): { todo: Todo; undoToken: string } {
    const cur = this.get(id);
    if (cur.deletedAt) throw new AppError('DELETED', '已删除的待办不能勾选');
    const now = this.now();
    const tx = this.db.transaction(() => {
      if (cur.status === 'open') {
        this.db
          .prepare("UPDATE todos SET status = 'done', completed_at = ?, updated_at = ? WHERE id = ?")
          .run(now.getTime(), now.getTime(), id);
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
          .run(uuidv7(), id, cur.dueDate, now.getTime(), localDate(now), now.getHours(), cur.title, rootTag ?? null);
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
