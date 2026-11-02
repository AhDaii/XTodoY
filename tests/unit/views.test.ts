import { describe, expect, it } from 'vitest';
import type { Todo } from '../../src/shared/types';
import { groupForView, weekEnd } from '../../src/main/domain/views';

const TODAY = '2026-11-02'; // 周一

let n = 0;
function todo(p: Partial<Todo>): Todo {
  n++;
  return {
    id: `t${n}`,
    title: `t${n}`,
    note: '',
    dueDate: null,
    dueTime: null,
    priority: 0,
    status: 'open',
    completedAt: null,
    sortKey: `a${n}`,
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
    tags: [],
    rrule: null,
    repeatAnchor: null,
    repeatCountDone: 0,
    reminders: [],
    ...p,
  };
}
const ids = (g: { items: Todo[] }) => g.items.map((t) => t.title);

describe('weekEnd', () => {
  it('周一开始的一周在周日结束', () => expect(weekEnd(TODAY, 1)).toBe('2026-11-08'));
  it('周日开始的一周在周六结束', () => expect(weekEnd(TODAY, 0)).toBe('2026-11-07'));
  it('周日当天（周一起始）是本周最后一天', () => expect(weekEnd('2026-11-08', 1)).toBe('2026-11-08'));
});

describe('今天视图（D-1：只含今天到期）', () => {
  const list = [
    todo({ title: 'late', dueDate: '2026-11-01' }),
    todo({ title: 'noon', dueDate: TODAY, dueTime: '12:00' }),
    todo({ title: 'allday', dueDate: TODAY }),
    todo({ title: 'done', dueDate: TODAY, status: 'done', completedAt: 1 }),
    todo({ title: 'nodate' }),
    todo({ title: 'deleted', dueDate: TODAY, deletedAt: 5 }),
  ];
  const [open, done] = groupForView('today', list, TODAY, 1);
  it('不含逾期、无日期与已删除，全天排在有时间的前面', () => expect(ids(open!)).toEqual(['allday', 'noon']));
  it('已完成单独分组', () => expect(ids(done!)).toEqual(['done']));
});

describe('计划视图', () => {
  const list = [
    todo({ title: 'overdue', dueDate: '2026-10-30' }),
    todo({ title: 'today', dueDate: TODAY }),
    todo({ title: 'tomorrow', dueDate: '2026-11-03' }),
    todo({ title: 'sunday', dueDate: '2026-11-08' }),
    todo({ title: 'next-monday', dueDate: '2026-11-09' }),
    todo({ title: 'nodate' }),
    todo({ title: 'finished', dueDate: TODAY, status: 'done' }),
  ];
  const g = groupForView('plan', list, TODAY, 1);
  it('按 逾期 / 今天 / 明天 / 本周 / 以后 分组，不含无日期与已完成', () => {
    expect(g.map((x) => [x.id, ids(x)])).toEqual([
      ['overdue', ['overdue']],
      ['plan-today', ['today']],
      ['plan-tomorrow', ['tomorrow']],
      ['plan-week', ['sunday']],
      ['plan-later', ['next-monday']],
    ]);
  });
});

describe('全部 / 已完成 / 回收站', () => {
  const a = todo({ title: 'high', dueDate: TODAY, priority: 3 });
  const b = todo({ title: 'low', dueDate: TODAY, priority: 1 });
  const c = todo({ title: 'nodate' });
  const d1 = todo({ title: 'd-old', status: 'done', completedAt: new Date(2026, 9, 31, 9).getTime() });
  const d2 = todo({ title: 'd-new', status: 'done', completedAt: new Date(2026, 10, 2, 9).getTime() });
  const x = todo({ title: 'trashed', deletedAt: 10 });
  it('全部：同一天按优先级降序，无日期单独分组', () => {
    const [dated, undated] = groupForView('all', [c, b, a], TODAY, 1);
    expect(ids(dated!)).toEqual(['high', 'low']);
    expect(ids(undated!)).toEqual(['nodate']);
  });
  it('已完成：按完成日期倒序分组', () => {
    const g = groupForView('done', [d1, d2], TODAY, 1);
    expect(g.map((x) => x.title)).toEqual(['2026-11-02', '2026-10-31']);
  });
  it('回收站只含已删除', () => {
    expect(ids(groupForView('trash', [a, x], TODAY, 1)[0]!)).toEqual(['trashed']);
  });
});
