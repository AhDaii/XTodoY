import { compareSortKeys } from '@shared/reorder';
import { generateKeyBetween } from 'fractional-indexing';
import { LIMITS, type TagColor, type TagNode } from '@shared/types';
import type { DB } from '../db/client';
import { uuidv7 } from '../domain/ids';
import { bus } from '../events/bus';
import { AppError, invalid, notFound } from './errors';

interface TagRow {
  id: string;
  parent_id: string | null;
  name: string;
  color: TagColor;
  sort_key: string;
  path: string;
  depth: number;
}

const MAX_DEPTH = LIMITS.tagDepthMax - 1; // depth 从 0 开始

/**
 * 多级标签（FR-TAG / FR-TGM）。层级用物化路径 path = /祖先id/…/自身id/ 表示，
 * 移动、删除、合并时在一个事务内批量改写子孙的 path 与 depth（database.md §2.2）。
 */
export class TagService {
  constructor(private readonly db: DB) {}

  private rows(): TagRow[] {
    return this.db.prepare('SELECT * FROM tags ORDER BY depth, sort_key').all() as TagRow[];
  }

  private row(id: string): TagRow {
    const r = this.db.prepare('SELECT * FROM tags WHERE id = ?').get(id) as TagRow | undefined;
    if (!r) throw notFound('标签');
    return r;
  }

  /** 按树的先序遍历返回（同级按 sort_key），附带显示路径与计数 */
  tree(): TagNode[] {
    const rows = this.rows();
    const byId = new Map(rows.map((r) => [r.id, r]));
    // 每个标签（含子孙）下的未完成事项数：一次取出未完成事项所挂标签的路径，在内存中按祖先去重累加。
    // 之前用 tags × tags 的 LIKE 前缀连接，1 万条事项、500 个标签时约 2 秒（tests/perf/capacity.test.ts）
    const openByTag = new Map<string, Set<string>>();
    const links = this.db
      .prepare(
        `SELECT tt.todo_id AS todo, d.path FROM todo_tags tt
         JOIN tags d ON d.id = tt.tag_id
         JOIN todos t ON t.id = tt.todo_id AND t.status = 'open' AND t.deleted_at IS NULL`,
      )
      .all() as { todo: string; path: string }[];
    for (const { todo, path } of links) {
      for (const id of path.split('/')) {
        if (!id) continue;
        let set = openByTag.get(id);
        if (!set) openByTag.set(id, (set = new Set()));
        set.add(todo);
      }
    }
    const open = new Map([...openByTag].map(([id, set]) => [id, set.size]));
    const direct = new Map(
      (
        this.db
          .prepare(
            `SELECT tt.tag_id AS id, COUNT(*) AS n FROM todo_tags tt
             JOIN todos t ON t.id = tt.todo_id AND t.deleted_at IS NULL GROUP BY tt.tag_id`,
          )
          .all() as { id: string; n: number }[]
      ).map((r) => [r.id, r.n]),
    );
    const children = new Map<string | null, TagRow[]>();
    for (const r of rows) children.set(r.parent_id, [...(children.get(r.parent_id) ?? []), r]);
    const out: TagNode[] = [];
    const walk = (parent: string | null): void => {
      for (const r of (children.get(parent) ?? []).sort((a, b) => compareSortKeys(a.sort_key, b.sort_key))) {
        out.push({
          id: r.id,
          parentId: r.parent_id,
          name: r.name,
          color: r.color,
          depth: r.depth,
          path: r.path,
          displayPath: this.displayPath(r, byId),
          openCount: open.get(r.id) ?? 0,
          todoCount: direct.get(r.id) ?? 0,
        });
        walk(r.id);
      }
    };
    walk(null);
    return out;
  }

  /** id → 显示路径，供待办列表展示标签胶囊 */
  displayMap(): Map<string, { name: string; color: TagColor; displayPath: string }> {
    const rows = this.rows();
    const byId = new Map(rows.map((r) => [r.id, r]));
    return new Map(rows.map((r) => [r.id, { name: r.name, color: r.color, displayPath: this.displayPath(r, byId) }]));
  }

  private displayPath(r: TagRow, byId: Map<string, TagRow>): string {
    return r.path
      .split('/')
      .filter(Boolean)
      .map((id) => byId.get(id)?.name ?? '?')
      .join(' / ');
  }

  create(input: { name: string; parentId: string | null; color?: TagColor }): TagNode {
    const parent = input.parentId ? this.row(input.parentId) : null;
    if (parent && parent.depth >= MAX_DEPTH) throw new AppError('TAG_TOO_DEEP', `标签最多 ${LIMITS.tagDepthMax} 级`);
    const id = uuidv7();
    const last = this.db
      .prepare('SELECT MAX(sort_key) FROM tags WHERE parent_id IS ?')
      .pluck()
      .get(parent?.id ?? null) as string | null;
    try {
      this.db
        .prepare('INSERT INTO tags (id, parent_id, name, color, sort_key, path, depth) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(
          id,
          parent?.id ?? null,
          input.name,
          input.color ?? parent?.color ?? 'slate',
          generateKeyBetween(last, null),
          `${parent?.path ?? '/'}${id}/`,
          parent ? parent.depth + 1 : 0,
        );
    } catch (e) {
      throw this.mapConstraint(e, input.name);
    }
    bus.emit('tags.changed');
    return this.tree().find((t) => t.id === id)!;
  }

  update(id: string, patch: { name?: string; color?: TagColor }): void {
    const r = this.row(id);
    try {
      this.db
        .prepare('UPDATE tags SET name = ?, color = ? WHERE id = ?')
        .run(patch.name ?? r.name, patch.color ?? r.color, id);
    } catch (e) {
      throw this.mapConstraint(e, patch.name ?? r.name);
    }
    bus.emit('tags.changed');
    bus.emit('todos.changed');
  }

  /** 拖拽：移到 parentId 之下（null 为根），并排在 beforeId / afterId 之间（FR-TGM-03） */
  move(id: string, parentId: string | null, beforeId: string | null = null, afterId: string | null = null): void {
    const r = this.row(id);
    const parent = parentId ? this.row(parentId) : null;
    if (parent && parent.path.startsWith(r.path)) throw new AppError('TAG_CYCLE', '不能把标签移到它自己的子标签下');
    const newDepth = parent ? parent.depth + 1 : 0;
    if (newDepth + this.height(r) > MAX_DEPTH) {
      throw new AppError('TAG_TOO_DEEP', `移动后会超过 ${LIMITS.tagDepthMax} 级`);
    }
    const key = (sid: string | null): string | null => (sid ? this.row(sid).sort_key : null);
    let lo = key(afterId);
    const hi = key(beforeId);
    if (!lo && !hi) {
      lo = this.db
        .prepare('SELECT MAX(sort_key) FROM tags WHERE parent_id IS ? AND id <> ?')
        .pluck()
        .get(parent?.id ?? null, id) as string | null;
    }
    const tx = this.db.transaction(() => {
      try {
        this.db
          .prepare('UPDATE tags SET parent_id = ?, sort_key = ? WHERE id = ?')
          .run(parent?.id ?? null, generateKeyBetween(lo, hi), id);
      } catch (e) {
        throw this.mapConstraint(e, r.name);
      }
      this.rebase(r, `${parent?.path ?? '/'}${id}/`, newDepth - r.depth);
    });
    tx();
    bus.emit('tags.changed');
    bus.emit('todos.changed');
  }

  /** 删除（D-5）：子标签上移一级或一并删除；事项只解除关联，不删除 */
  delete(id: string, children: 'promote' | 'delete'): void {
    const r = this.row(id);
    const tx = this.db.transaction(() => {
      if (children === 'promote') {
        const kids = this.db.prepare('SELECT * FROM tags WHERE parent_id = ?').all(id) as TagRow[];
        for (const k of kids) {
          try {
            this.db.prepare('UPDATE tags SET parent_id = ? WHERE id = ?').run(r.parent_id, k.id);
          } catch (e) {
            throw this.mapConstraint(e, k.name);
          }
          this.rebase(k, `${r.path.slice(0, -(id.length + 1))}${k.id}/`, -1);
        }
        this.db.prepare('DELETE FROM tags WHERE id = ?').run(id);
      } else {
        // parent_id 外键为 RESTRICT：按深度从深到浅逐个删除
        const ids = this.db
          .prepare("SELECT id FROM tags WHERE path LIKE ? || '%' ORDER BY depth DESC")
          .pluck()
          .all(r.path) as string[];
        const del = this.db.prepare('DELETE FROM tags WHERE id = ?');
        for (const tid of ids) del.run(tid);
      }
    });
    tx();
    bus.emit('tags.changed');
    bus.emit('todos.changed');
  }

  /** 合并（FR-TGM-05）：from 的事项改挂 to，子标签移到 to 下，然后删除 from */
  merge(fromId: string, toId: string): void {
    if (fromId === toId) throw invalid('不能合并到自身');
    const from = this.row(fromId);
    const to = this.row(toId);
    if (to.path.startsWith(from.path)) throw new AppError('TAG_CYCLE', '不能合并到自己的子标签');
    const kids = this.db.prepare('SELECT * FROM tags WHERE parent_id = ?').all(fromId) as TagRow[];
    for (const k of kids) {
      if (to.depth + 1 + this.height(k) > MAX_DEPTH) {
        throw new AppError('TAG_TOO_DEEP', `合并后"${k.name}"会超过 ${LIMITS.tagDepthMax} 级`);
      }
    }
    const tx = this.db.transaction(() => {
      this.db
        .prepare('INSERT OR IGNORE INTO todo_tags (todo_id, tag_id) SELECT todo_id, ? FROM todo_tags WHERE tag_id = ?')
        .run(toId, fromId);
      this.db.prepare('DELETE FROM todo_tags WHERE tag_id = ?').run(fromId);
      for (const k of kids) {
        try {
          this.db.prepare('UPDATE tags SET parent_id = ? WHERE id = ?').run(toId, k.id);
        } catch (e) {
          throw this.mapConstraint(e, k.name);
        }
        this.rebase(k, `${to.path}${k.id}/`, to.depth + 1 - k.depth);
      }
      this.db.prepare('DELETE FROM tags WHERE id = ?').run(fromId);
    });
    tx();
    bus.emit('tags.changed');
    bus.emit('todos.changed');
  }

  /** 改写 r 及其子孙的 path 前缀与 depth */
  private rebase(r: TagRow, newPath: string, depthDelta: number): void {
    this.db
      .prepare(
        `UPDATE tags SET path = ? || substr(path, ?), depth = depth + ?
         WHERE path LIKE ? || '%'`,
      )
      .run(newPath, r.path.length + 1, depthDelta, r.path);
  }

  /** 子树高度：0 表示没有子标签 */
  private height(r: TagRow): number {
    const max = this.db.prepare("SELECT MAX(depth) FROM tags WHERE path LIKE ? || '%'").pluck().get(r.path) as number;
    return max - r.depth;
  }

  private mapConstraint(e: unknown, name: string): unknown {
    if (e instanceof Error && /UNIQUE/.test(e.message)) {
      return new AppError('TAG_DUPLICATE', `同一层级下已存在"${name}"`);
    }
    return e;
  }
}
