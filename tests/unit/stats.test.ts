import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../../src/main/db/migrate';
import { periodRange, streaks } from '../../src/main/domain/stats';
import { StatsService } from '../../src/main/services/stats';
import { TagService } from '../../src/main/services/tags';
import { TodoService } from '../../src/main/services/todos';
import { DEFAULT_SETTINGS, type Settings } from '../../src/shared/types';

describe('periodRange', () => {
  // 2026-11-04 周三
  const today = '2026-11-04';

  it('日：前一天为上期', () => {
    expect(periodRange('day', 0, today, 1)).toMatchObject({
      from: today,
      to: today,
      prevFrom: '2026-11-03',
      elapsed: 1,
    });
    expect(periodRange('day', -1, today, 1)).toMatchObject({ from: '2026-11-03', prevTo: '2026-11-02' });
  });

  it('周：遵循周起始日，本周未结束时与上周同期（相同天数）比较', () => {
    const mon = periodRange('week', 0, today, 1);
    expect(mon).toMatchObject({ from: '2026-11-02', to: '2026-11-08', prevFrom: '2026-10-26', prevTo: '2026-11-01' });
    expect(mon.elapsed).toBe(3);
    expect(mon.prevSameTo).toBe('2026-10-28');
    expect(periodRange('week', 0, today, 0)).toMatchObject({ from: '2026-11-01', to: '2026-11-07' });
    expect(periodRange('week', -1, today, 1)).toMatchObject({
      from: '2026-10-26',
      elapsed: 7,
      prevSameTo: '2026-10-25',
    });
  });

  it('月：上月同期不超过上月最后一天', () => {
    const m = periodRange('month', 0, '2026-03-31', 1);
    expect(m).toMatchObject({ from: '2026-03-01', to: '2026-03-31', prevFrom: '2026-02-01', prevTo: '2026-02-28' });
    expect(m.prevSameTo).toBe('2026-02-28');
    expect(periodRange('month', -2, today, 1)).toMatchObject({ from: '2026-09-01', to: '2026-09-30', days: 30 });
    expect(periodRange('month', -11, today, 1)).toMatchObject({ from: '2025-12-01', prevFrom: '2025-11-01' });
  });
});

describe('streaks', () => {
  it('今天未完成时从昨天往前数；最长纪录跨月', () => {
    const dates = ['2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-03'];
    expect(streaks(dates, '2026-11-04')).toMatchObject({ current: 1, best: 4 });
    expect(streaks([...dates, '2026-11-04'], '2026-11-04').current).toBe(2);
    expect(streaks(['2026-11-01'], '2026-11-04').current).toBe(0);
    expect(streaks([], '2026-11-04').last7.map((x) => x.on)).toEqual(Array(7).fill(false));
  });
});

describe('StatsService', () => {
  let db: Database.Database;
  let todos: TodoService;
  let tags: TagService;
  let stats: StatsService;
  let now = new Date();
  const settings: Settings = { ...DEFAULT_SETTINGS, weekStart: 1, defaultReminder: -1 };

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    migrate(db);
    tags = new TagService(db);
    todos = new TodoService(
      db,
      tags,
      () => settings,
      () => now,
    );
    stats = new StatsService(db, () => settings);
  });

  const doneAt = (title: string, at: Date, tagIds: string[] = [], dueDate?: string) => {
    now = at;
    const t = todos.create({ title, tagIds, dueDate });
    todos.toggle(t.id);
    return t;
  };

  it('AC FR-STA-02：周一完成 3 项、周三完成 2 项，趋势周一为 3、周三为 2，合计 5', () => {
    for (let i = 0; i < 3; i++) doneAt(`一${i}`, new Date(2026, 10, 2, 9 + i));
    for (let i = 0; i < 2; i++) doneAt(`三${i}`, new Date(2026, 10, 4, 14));
    const s = stats.get({ period: 'week', offset: 0 }, new Date(2026, 10, 4, 20));
    expect(s.total).toBe(5);
    expect(s.daily.map((d) => d.count)).toEqual([3, 0, 2, 0, 0, 0, 0]);
    expect(s.best).toEqual({ date: '2026-11-02', count: 3 });
    expect(s.hours[14]).toBe(2);
    expect(s.logs[0]!.title).toMatch(/^三/);
  });

  it('与上期同期比较；取消完成删除记录', () => {
    doneAt('上周一', new Date(2026, 9, 26, 9));
    doneAt('上周五', new Date(2026, 9, 30, 9)); // 不在"同期"（周一到周三）内
    const t = doneAt('本周', new Date(2026, 10, 3, 9));
    let s = stats.get({ period: 'week', offset: 0 }, new Date(2026, 10, 4, 9));
    expect([s.total, s.prevTotal]).toEqual([1, 1]);
    expect(s.prevDaily).toEqual([1, 0, 0, 0, 1, 0, 0]);
    todos.toggle(t.id);
    s = stats.get({ period: 'week', offset: 0 }, new Date(2026, 10, 4, 9));
    expect(s.total).toBe(0);
  });

  it('到期完成率只统计截止日期在本期内的事项', () => {
    now = new Date(2026, 10, 4, 8);
    todos.create({ title: '未完成', dueDate: '2026-11-04' });
    todos.create({ title: '无日期' });
    doneAt('已完成', new Date(2026, 10, 4, 9), [], '2026-11-04');
    const s = stats.get({ period: 'day', offset: 0 }, new Date(2026, 10, 4, 10));
    expect(s.due).toEqual({ total: 2, done: 1 });
  });

  it('按根标签分布，可下钻到一级子标签', () => {
    const work = tags.create({ name: '工作', parentId: null });
    const proj = tags.create({ name: '项目A', parentId: work.id });
    const deep = tags.create({ name: '设计', parentId: proj.id });
    const life = tags.create({ name: '生活', parentId: null });
    const at = new Date(2026, 10, 4, 9);
    doneAt('a', at, [deep.id]);
    doneAt('b', at, [proj.id]);
    doneAt('c', at, [work.id]);
    doneAt('d', at, [life.id]);
    doneAt('e', at);
    const s = stats.get({ period: 'day', offset: 0 }, at);
    expect(s.byTag.map((x) => [x.tag?.name ?? null, x.count])).toEqual([
      ['工作', 3],
      ['生活', 1],
      [null, 1],
    ]);
    const d = stats.get({ period: 'day', offset: 0, tagId: work.id }, at);
    expect(d.drill?.name).toBe('工作');
    expect(d.byTag.map((x) => [x.tag?.name, x.self ?? false, x.count])).toEqual([
      ['项目A', false, 2],
      ['工作', true, 1],
    ]);
  });

  it('不允许查询未来周期', () => {
    expect(() => stats.get({ period: 'day', offset: 1 })).toThrow();
  });
});
