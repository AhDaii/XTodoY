import Database from 'better-sqlite3';
import { mkdirSync, writeFileSync } from 'node:fs';
import { generateNKeysBetween } from 'fractional-indexing';
import { beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '../../src/main/db/migrate';
import { localDate } from '../../src/main/domain/time';
import { StatsService } from '../../src/main/services/stats';
import { TagService } from '../../src/main/services/tags';
import { TodoService } from '../../src/main/services/todos';
import { DEFAULT_SETTINGS, type Settings } from '../../src/shared/types';

/**
 * NFR-PERF-07 容量：10 000 条事项、100 000 条完成记录、500 个标签下，
 * 服务层操作满足 NFR-PERF-06（勾选 / 新建 / 切换视图 ≤ 100 ms，搜索 ≤ 200 ms，统计 ≤ 500 ms）。
 * 这里测的是主进程服务层（不含 IPC 与界面渲染），取 5 次的中位数。
 */
const TODOS = 10_000;
const LOGS = 100_000;
const TAGS = 500;

let db: Database.Database;
let todos: TodoService;
let tags: TagService;
let stats: StatsService;
const settings: Settings = { ...DEFAULT_SETTINGS, defaultReminder: -1 };
const results: { op: string; ms: number; budget: number }[] = [];

function median(fn: () => unknown, runs = 5): number {
  const t: number[] = [];
  for (let i = 0; i < runs; i++) {
    const s = performance.now();
    fn();
    t.push(performance.now() - s);
  }
  return t.sort((a, b) => a - b)[Math.floor(runs / 2)]!;
}

function measure(op: string, budget: number, fn: () => unknown): void {
  const ms = median(fn);
  results.push({ op, ms: Math.round(ms * 10) / 10, budget });
  if (process.env['PERF_DIAG']) return;
  expect(ms, `${op} 用时 ${ms.toFixed(1)} ms，预算 ${budget} ms`).toBeLessThanOrEqual(budget);
}

beforeAll(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db);
  tags = new TagService(db);
  todos = new TodoService(db, tags, () => settings);
  stats = new StatsService(db, () => settings);

  // 500 个标签：20 个根标签，每个下面 24 个子标签
  const tagIds: string[] = [];
  for (let r = 0; r < 20; r++) {
    const root = tags.create({ name: `根标签${r}`, parentId: null });
    tagIds.push(root.id);
    for (let c = 0; c < 24; c++) tagIds.push(tags.create({ name: `子${c}`, parentId: root.id }).id);
  }
  expect(tagIds).toHaveLength(TAGS);

  const today = new Date();
  const day = (offset: number) => localDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset));
  const keys = generateNKeysBetween(null, null, TODOS);
  const insTodo = db.prepare(
    `INSERT INTO todos (id, title, note, due_date, due_time, status, completed_at, priority, sort_key, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insLink = db.prepare('INSERT INTO todo_tags (todo_id, tag_id) VALUES (?, ?)');
  const insLog = db.prepare(
    `INSERT INTO completion_logs (id, todo_id, completed_at, completed_local_date, completed_local_hour, title_snapshot, root_tag_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  db.transaction(() => {
    for (let i = 0; i < TODOS; i++) {
      const done = i % 2 === 0;
      const id = `todo-${String(i).padStart(5, '0')}`;
      insTodo.run(
        id,
        `第 ${i} 项待办 ${i % 7 === 0 ? '周报' : '事项'}`,
        i % 5 === 0 ? `备注 ${i}` : '',
        i % 4 === 3 ? null : day((i % 61) - 30),
        i % 3 === 0 ? '09:30' : null,
        done ? 'done' : 'open',
        done ? Date.now() - i * 60_000 : null,
        i % 4,
        keys[i],
        Date.now() - i * 1000,
        Date.now(),
      );
      insLink.run(id, tagIds[i % TAGS]);
    }
    // 10 万条完成记录分布在过去 400 天
    for (let i = 0; i < LOGS; i++) {
      const back = i % 400;
      const at = new Date(today.getFullYear(), today.getMonth(), today.getDate() - back, 8 + (i % 12), i % 60);
      insLog.run(`log-${i}`, null, at.getTime(), localDate(at), at.getHours(), `完成 ${i}`, tagIds[(i % 20) * 25]);
    }
  })();
});

describe('容量与性能（NFR-PERF-06 / 07）', () => {
  it('切换视图 ≤ 100 ms', () => {
    measure('今天视图', 100, () => todos.list({ view: 'today' }));
    measure('计划视图', 100, () => todos.list({ view: 'plan' }));
    measure('全部视图', 100, () => todos.list({ view: 'all' }));
    measure('标签视图（含子标签）', 100, () => todos.list({ tagId: tags.tree()[0]!.id }));
    measure('侧边栏计数', 100, () => todos.counts());
    measure('标签树', 100, () => tags.tree());
  });

  it('勾选、新建 ≤ 100 ms', () => {
    const open = todos.list({ view: 'all' })[0]!.items[0]!;
    measure('勾选完成并取消', 100, () => {
      todos.toggle(open.id);
      todos.toggle(open.id);
    });
    measure('新建待办', 100, () => todos.create({ title: '新的待办' }));
  });

  it('搜索 ≤ 200 ms（FR-TODO-08）', () => {
    measure('搜索"周报"', 200, () => todos.list({ search: '周报' }));
  });

  it('统计 ≤ 500 ms', () => {
    measure('统计·日', 500, () => stats.get({ period: 'day', offset: 0 }));
    measure('统计·周', 500, () => stats.get({ period: 'week', offset: 0 }));
    measure('统计·月', 500, () => stats.get({ period: 'month', offset: 0 }));
    measure('统计·月（标签下钻）', 500, () => stats.get({ period: 'month', offset: 0, tagId: tags.tree()[0]!.id }));
  });

  it('输出结果到 test-results/perf-capacity.json', () => {
    mkdirSync('test-results', { recursive: true });
    writeFileSync(
      'test-results/perf-capacity.json',
      JSON.stringify({ todos: TODOS, logs: LOGS, tags: TAGS, results }, null, 2),
    );
  });
});
