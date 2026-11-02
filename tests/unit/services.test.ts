import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../../src/main/db/migrate';
import { TagService } from '../../src/main/services/tags';
import { TodoService } from '../../src/main/services/todos';
import { SettingsService } from '../../src/main/services/settings';

const NOW = new Date(2026, 10, 2, 10, 30); // 2026-11-02 周一 10:30
let db: Database.Database;
let tags: TagService;
let todos: TodoService;

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db);
  tags = new TagService(db);
  todos = new TodoService(
    db,
    tags,
    () => ({ weekStart: 1 }),
    () => NOW,
  );
});

const titles = (groups: { items: { title: string }[] }[]) => groups.flatMap((g) => g.items.map((t) => t.title));

describe('TodoService', () => {
  it('新建的待办出现在今天视图，计数正确', () => {
    todos.create({ title: '写周报', dueDate: '2026-11-02' });
    todos.create({ title: '无日期' });
    expect(titles(todos.list({ view: 'today' }))).toEqual(['写周报']);
    expect(todos.counts()).toMatchObject({ today: 1, all: 2, plan: 1, done: 0 });
  });

  it('清除日期时一并清除时间', () => {
    const t = todos.create({ title: 'a', dueDate: '2026-11-02', dueTime: '09:00' });
    const u = todos.update(t.id, { dueDate: null });
    expect(u.dueDate).toBeNull();
    expect(u.dueTime).toBeNull();
  });

  it('勾选完成写入完成记录，撤销后删除记录（FR-TODO-03）', () => {
    const t = todos.create({ title: '回复邮件', dueDate: '2026-11-02' });
    const { undoToken } = todos.toggle(t.id);
    const log = db.prepare('SELECT * FROM completion_logs').get() as Record<string, unknown>;
    expect(log).toMatchObject({
      todo_id: t.id,
      completed_local_date: '2026-11-02',
      completed_local_hour: 10,
      title_snapshot: '回复邮件',
    });
    expect(todos.get(t.id).status).toBe('done');
    todos.undo(undoToken);
    expect(todos.get(t.id).status).toBe('open');
    expect(db.prepare('SELECT COUNT(*) FROM completion_logs').pluck().get()).toBe(0);
  });

  it('完成记录保存根标签快照', () => {
    const work = tags.create({ name: '工作', parentId: null });
    const a = tags.create({ name: '项目A', parentId: work.id });
    const t = todos.create({ title: 'x', tagIds: [a.id] });
    todos.toggle(t.id);
    expect(db.prepare('SELECT root_tag_id FROM completion_logs').pluck().get()).toBe(work.id);
  });

  it('删除进回收站可撤销；永久删除级联删除完成记录', () => {
    const t = todos.create({ title: 'x', dueDate: '2026-11-02' });
    const { undoToken } = todos.remove(t.id);
    expect(titles(todos.list({ view: 'today' }))).toEqual([]);
    expect(titles(todos.list({ view: 'trash' }))).toEqual(['x']);
    todos.undo(undoToken);
    expect(titles(todos.list({ view: 'today' }))).toEqual(['x']);
    todos.toggle(t.id);
    todos.remove(t.id);
    todos.purge(t.id);
    expect(db.prepare('SELECT COUNT(*) FROM completion_logs').pluck().get()).toBe(0);
  });

  it('搜索匹配标题与备注，转义通配符', () => {
    const a = todos.create({ title: '100% 完成' });
    todos.update(a.id, { note: '含备注关键词' });
    todos.create({ title: '其他' });
    expect(titles(todos.list({ search: '%' }))).toEqual(['100% 完成']);
    expect(titles(todos.list({ search: '关键词' }))).toEqual(['100% 完成']);
  });

  it('每个待办最多 10 个标签，标签必须存在', () => {
    const ids = Array.from({ length: 11 }, (_, i) => tags.create({ name: `t${i}`, parentId: null }).id);
    const t = todos.create({ title: 'x' });
    expect(() => todos.setTags(t.id, ids)).toThrow(/最多 10 个/);
    expect(() => todos.setTags(t.id, ['nope'])).toThrow(/不存在/);
  });

  it('手动排序：放到两个事项之间', () => {
    const a = todos.create({ title: 'a' });
    const b = todos.create({ title: 'b' }); // 新建在最前：b < a
    const c = todos.create({ title: 'c' }); // c < b < a
    todos.reorder(c.id, b.id, a.id);
    const keys = [b, c, a].map((t) => todos.get(t.id).sortKey);
    expect([...keys].sort()).toEqual(keys);
  });
});

describe('TagService', () => {
  it('含子标签的标签视图（FR-TAG-03）', () => {
    const work = tags.create({ name: '工作', parentId: null });
    const a = tags.create({ name: '项目A', parentId: work.id });
    const b = tags.create({ name: '项目B', parentId: work.id });
    todos.create({ title: 'in-a', tagIds: [a.id] });
    todos.create({ title: 'in-b', tagIds: [b.id] });
    expect(titles(todos.list({ tagId: work.id })).sort()).toEqual(['in-a', 'in-b']);
    expect(titles(todos.list({ tagId: work.id, includeChildren: false }))).toEqual([]);
    expect(titles(todos.list({ tagId: a.id }))).toEqual(['in-a']);
    expect(tags.tree().find((t) => t.id === work.id)?.openCount).toBe(2);
  });

  it('子标签默认继承父标签颜色，显示路径完整', () => {
    const work = tags.create({ name: '工作', parentId: null, color: 'teal' });
    const a = tags.create({ name: '项目A', parentId: work.id });
    expect(a.color).toBe('teal');
    expect(a.displayPath).toBe('工作 / 项目A');
  });

  it('同级重名（不区分大小写）被拒绝，不同层级可以重名', () => {
    const w = tags.create({ name: 'Work', parentId: null });
    expect(() => tags.create({ name: 'work', parentId: null })).toThrow(/已存在/);
    expect(() => tags.create({ name: 'work', parentId: w.id })).not.toThrow();
  });

  it('最多 5 级', () => {
    let parent: string | null = null;
    for (let i = 0; i < 5; i++) parent = tags.create({ name: `L${i}`, parentId: parent }).id;
    expect(() => tags.create({ name: 'L5', parentId: parent })).toThrow(/最多 5 级/);
  });

  it('移动标签会改写子孙路径与深度，不能移入自己的子孙', () => {
    const a = tags.create({ name: 'A', parentId: null });
    const a1 = tags.create({ name: 'A1', parentId: a.id });
    const a11 = tags.create({ name: 'A11', parentId: a1.id });
    const b = tags.create({ name: 'B', parentId: null });
    tags.move(a1.id, b.id);
    const t = tags.tree().find((x) => x.id === a11.id)!;
    expect(t.displayPath).toBe('B / A1 / A11');
    expect(t.depth).toBe(2);
    expect(() => tags.move(b.id, a11.id)).toThrow(/子标签/);
  });

  it('移动后超过 5 级被拒绝', () => {
    let parent: string | null = null;
    for (let i = 0; i < 4; i++) parent = tags.create({ name: `L${i}`, parentId: parent }).id;
    const x = tags.create({ name: 'X', parentId: null });
    tags.create({ name: 'X1', parentId: x.id });
    expect(() => tags.move(x.id, parent)).toThrow(/超过 5 级/);
  });

  it('删除标签：子标签上移一级，事项保留但解除关联（D-5）', () => {
    const work = tags.create({ name: '工作', parentId: null });
    const a = tags.create({ name: '项目A', parentId: work.id });
    const d = tags.create({ name: '设计', parentId: a.id });
    const t = todos.create({ title: 'x', tagIds: [work.id, d.id] });
    tags.delete(work.id, 'promote');
    const tree = tags.tree();
    expect(tree.map((x) => x.displayPath)).toEqual(['项目A', '项目A / 设计']);
    expect(tree.find((x) => x.id === d.id)?.depth).toBe(1);
    expect(todos.get(t.id).tags.map((x) => x.id)).toEqual([d.id]);
  });

  it('删除标签：一并删除子孙', () => {
    const work = tags.create({ name: '工作', parentId: null });
    const a = tags.create({ name: '项目A', parentId: work.id });
    tags.create({ name: '设计', parentId: a.id });
    const t = todos.create({ title: 'x', tagIds: [a.id] });
    tags.delete(work.id, 'delete');
    expect(tags.tree()).toEqual([]);
    expect(todos.get(t.id).tags).toEqual([]);
  });

  it('合并：事项改挂目标（不重复），子标签移到目标下', () => {
    const a = tags.create({ name: 'A', parentId: null });
    const a1 = tags.create({ name: 'A1', parentId: a.id });
    const b = tags.create({ name: 'B', parentId: null });
    const t1 = todos.create({ title: 't1', tagIds: [a.id] });
    const t2 = todos.create({ title: 't2', tagIds: [a.id, b.id] });
    tags.merge(a.id, b.id);
    expect(todos.get(t1.id).tags.map((x) => x.id)).toEqual([b.id]);
    expect(todos.get(t2.id).tags.map((x) => x.id)).toEqual([b.id]);
    expect(tags.tree().find((x) => x.id === a1.id)?.displayPath).toBe('B / A1');
  });
});

describe('SettingsService', () => {
  it('默认值、持久化与校验', () => {
    const s = new SettingsService(db);
    expect(s.get().theme).toBe('system');
    s.set('theme', 'dark');
    expect(new SettingsService(db).get().theme).toBe('dark');
    expect(() => s.set('theme', 'blue')).toThrow();
    expect(() => s.set('weekStart', 3)).toThrow();
  });
});
