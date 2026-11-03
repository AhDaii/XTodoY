import {
  STATS_LOG_LIMIT,
  type Stats,
  type StatsLog,
  type StatsQuery,
  type StatsSlice,
  type StatsTag,
} from '@shared/stats';
import type { Settings, TagColor } from '@shared/types';
import type { DB } from '../db/client';
import { addDays, diffDays, periodRange, streaks } from '../domain/stats';
import { localDate } from '../domain/time';
import { invalid } from './errors';

interface LogRow {
  id: string;
  todo_id: string | null;
  completed_at: number;
  d: string;
  h: number;
  title: string;
  tag_id: string | null;
  tag_name: string | null;
  tag_color: TagColor | null;
}

const tagOf = (id: string | null, name: string | null, color: TagColor | null): StatsTag | null =>
  id && name && color ? { id, name, color } : null;

/**
 * 统计（SRS F8）：以完成记录为准，按完成时的本地日期归属（FR-STA-01，D-10）。
 * 一次调用返回统计页所需的全部数据；查询都是 completed_local_date 索引上的范围扫描。
 */
export class StatsService {
  constructor(
    private readonly db: DB,
    private readonly settings: () => Settings,
  ) {}

  get(q: StatsQuery, now = new Date()): Stats {
    if (q.offset > 0) throw invalid('不能查看未来的统计');
    const today = localDate(now);
    const p = periodRange(q.period, q.offset, today, this.settings().weekStart);

    const rows = this.db
      .prepare(
        `SELECT l.id, l.todo_id, l.completed_at, l.completed_local_date AS d, l.completed_local_hour AS h,
                l.title_snapshot AS title, t.id AS tag_id, t.name AS tag_name, t.color AS tag_color
           FROM completion_logs l LEFT JOIN tags t ON t.id = l.root_tag_id
          WHERE l.completed_local_date BETWEEN ? AND ?
          ORDER BY l.completed_at DESC`,
      )
      .all(p.from, p.to) as LogRow[];

    const perDay = new Map<string, number>();
    const hours = Array<number>(24).fill(0);
    for (const r of rows) {
      perDay.set(r.d, (perDay.get(r.d) ?? 0) + 1);
      hours[r.h] = (hours[r.h] ?? 0) + 1;
    }
    const daily = Array.from({ length: p.days }, (_, i) => {
      const date = addDays(p.from, i);
      return { date, count: perDay.get(date) ?? 0 };
    });
    let best: Stats['best'] = null;
    for (const x of daily.slice(0, p.elapsed)) if (x.count > 0 && (!best || x.count > best.count)) best = x;

    const prevCounts = new Map(
      (
        this.db
          .prepare(
            `SELECT completed_local_date AS d, COUNT(*) AS n FROM completion_logs
              WHERE completed_local_date BETWEEN ? AND ? GROUP BY completed_local_date`,
          )
          .all(p.prevFrom, p.prevTo) as { d: string; n: number }[]
      ).map((r) => [r.d, r.n]),
    );
    const prevDays = diffDays(p.prevTo, p.prevFrom) + 1;
    const prevDaily = Array.from({ length: prevDays }, (_, i) => prevCounts.get(addDays(p.prevFrom, i)) ?? 0);
    const prevTotal = prevDaily.slice(0, diffDays(p.prevSameTo, p.prevFrom) + 1).reduce((a, b) => a + b, 0);

    const due = this.db
      .prepare(
        `SELECT COUNT(*) AS total, COALESCE(SUM(status = 'done'), 0) AS done FROM todos
          WHERE deleted_at IS NULL AND due_date BETWEEN ? AND ?`,
      )
      .get(p.from, p.to) as { total: number; done: number };

    const dates = this.db
      .prepare('SELECT DISTINCT completed_local_date FROM completion_logs ORDER BY 1')
      .pluck()
      .all() as string[];

    const logs: StatsLog[] = rows.slice(0, STATS_LOG_LIMIT).map((r) => ({
      id: r.id,
      todoId: r.todo_id,
      title: r.title,
      at: r.completed_at,
      date: r.d,
      hour: r.h,
      tag: tagOf(r.tag_id, r.tag_name, r.tag_color),
    }));

    const { byTag, drill } = this.distribution(rows, q.tagId);
    return {
      period: q.period,
      offset: q.offset,
      today,
      from: p.from,
      to: p.to,
      prevFrom: p.prevFrom,
      prevTo: p.prevTo,
      elapsed: p.elapsed,
      total: rows.length,
      prevTotal,
      best,
      hours,
      daily,
      prevDaily,
      due,
      streak: streaks(dates, today),
      byTag,
      drill,
      logs,
      logsTruncated: rows.length > STATS_LOG_LIMIT,
    };
  }

  /** 按根标签分布；指定 tagId 时下钻：按事项当前所带的、该根标签下的一级子标签归类（FR-STA-04） */
  private distribution(rows: LogRow[], tagId?: string): { byTag: StatsSlice[]; drill: StatsTag | null } {
    const sort = (a: StatsSlice, b: StatsSlice) => b.count - a.count;
    if (!tagId) {
      const m = new Map<string | null, StatsSlice>();
      for (const r of rows) {
        const tag = tagOf(r.tag_id, r.tag_name, r.tag_color);
        const k = tag?.id ?? null;
        const s = m.get(k) ?? { tag, count: 0 };
        s.count++;
        m.set(k, s);
      }
      return { byTag: [...m.values()].sort(sort), drill: null };
    }
    const root = this.db.prepare('SELECT id, name, color FROM tags WHERE id = ?').get(tagId) as StatsTag | undefined;
    if (!root) return this.distribution(rows);
    const inRoot = rows.filter((r) => r.tag_id === tagId);
    const ids = [...new Set(inRoot.map((r) => r.todo_id).filter((x): x is string => x !== null))];
    // 每个事项归到它所带的第一个一级子标签（按子标签排序）
    const childOf = new Map<string, StatsTag>();
    if (ids.length) {
      const found = this.db
        .prepare(
          `SELECT tt.todo_id, c.id, c.name, c.color
             FROM todo_tags tt
             JOIN tags d ON d.id = tt.tag_id
             JOIN tags c ON c.parent_id = ? AND d.path LIKE c.path || '%'
            WHERE tt.todo_id IN (SELECT value FROM json_each(?))
            ORDER BY c.sort_key`,
        )
        .all(tagId, JSON.stringify(ids)) as ({ todo_id: string } & StatsTag)[];
      for (const f of found)
        if (!childOf.has(f.todo_id)) childOf.set(f.todo_id, { id: f.id, name: f.name, color: f.color });
    }
    const m = new Map<string, StatsSlice>();
    for (const r of inRoot) {
      const child = r.todo_id ? childOf.get(r.todo_id) : undefined;
      const k = child?.id ?? '';
      const s = m.get(k) ?? (child ? { tag: child, count: 0 } : { tag: root, self: true, count: 0 });
      s.count++;
      m.set(k, s);
    }
    return { byTag: [...m.values()].sort(sort), drill: root };
  }
}
