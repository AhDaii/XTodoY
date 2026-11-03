// 原型示例数据。原型中的"今天"固定为 2026-11-02（周一），便于评审时结果一致。
const TODAY = '2026-11-02';

const TAG_COLORS = ['teal', 'blue', 'indigo', 'violet', 'pink', 'red', 'orange', 'amber', 'lime', 'green', 'cyan', 'slate'];

const SEED_TAGS = [
  { id: 't1', parent: null, name: '工作', color: 'teal' },
  { id: 't2', parent: 't1', name: '项目A', color: 'teal' },
  { id: 't3', parent: 't2', name: '设计', color: 'cyan' },
  { id: 't4', parent: 't1', name: '项目B', color: 'blue' },
  { id: 't5', parent: null, name: '个人', color: 'violet' },
  { id: 't6', parent: 't5', name: '健身', color: 'green' },
  { id: 't7', parent: 't5', name: '阅读', color: 'amber' },
  { id: 't8', parent: null, name: '学习', color: 'indigo' },
  { id: 't9', parent: 't8', name: '英语', color: 'indigo' },
  { id: 't10', parent: null, name: '家庭', color: 'pink' },
];

const SEED_TODOS = [
  { id: 'a1', title: '评审 XTodoY 界面原型', note: '重点看深色模式与悬浮窗状态', date: TODAY, time: '10:00', priority: 'high', tags: ['t3'], reminders: [{ min: 15 }], repeat: null },
  { id: 'a2', title: '项目A 周会', note: '', date: TODAY, time: '14:30', priority: 'medium', tags: ['t2'], reminders: [{ min: 5 }], repeat: { type: 'weekly', interval: 1, days: [1], end: { type: 'never' } } },
  { id: 'a3', title: '晨跑 5 公里', note: '', date: TODAY, time: '07:00', priority: 'none', tags: ['t6'], reminders: [{ min: 0 }], repeat: { type: 'weekly', interval: 1, days: [1, 3, 5], end: { type: 'never' } }, done: true, doneAt: `${TODAY} 07:42` },
  { id: 'a4', title: '背 30 个单词', note: '扇贝 · 雅思词表', date: TODAY, time: null, priority: 'low', tags: ['t9'], reminders: [{ min: 0 }], repeat: { type: 'daily', interval: 1, end: { type: 'never' } } },
  { id: 'a5', title: '回复客户邮件', note: '附上报价单 v2', date: TODAY, time: '11:00', priority: 'high', tags: ['t4'], reminders: [{ min: 30 }], repeat: null, done: true, doneAt: `${TODAY} 09:15` },
  { id: 'a6', title: '给妈妈打电话', note: '', date: TODAY, time: '20:00', priority: 'none', tags: ['t10'], reminders: [{ min: 0 }], repeat: { type: 'weekly', interval: 1, days: [0], end: { type: 'never' } } },
  { id: 'b1', title: '提交 10 月报销', note: '发票已扫描', date: '2026-10-30', time: null, priority: 'medium', tags: ['t1'], reminders: [], repeat: null },
  { id: 'b2', title: '还图书馆的书', note: '', date: '2026-10-31', time: null, priority: 'low', tags: ['t7'], reminders: [], repeat: null },
  { id: 'c1', title: '项目B 需求评审', note: '准备 3 个问题', date: '2026-11-03', time: '15:00', priority: 'high', tags: ['t4'], reminders: [{ min: 60 }], repeat: null },
  { id: 'c2', title: '读完《人月神话》第 3 章', note: '', date: '2026-11-04', time: null, priority: 'none', tags: ['t7'], reminders: [], repeat: null },
  { id: 'c3', title: '交房租', note: '', date: '2026-11-05', time: null, priority: 'medium', tags: ['t10'], reminders: [{ min: 1440 }], repeat: { type: 'monthly', interval: 1, monthDay: 5, end: { type: 'never' } } },
  { id: 'c4', title: '整理设计令牌命名', note: '', date: '2026-11-12', time: null, priority: 'low', tags: ['t3'], reminders: [], repeat: null },
  { id: 'c5', title: '体检预约', note: '', date: '2026-11-20', time: '09:00', priority: 'none', tags: ['t5'], reminders: [{ min: 1440 }], repeat: null },
  { id: 'd1', title: '想一个周末徒步路线', note: '', date: null, time: null, priority: 'none', tags: ['t5'], reminders: [], repeat: null },
  { id: 'd2', title: '研究 Electron 托盘内存占用', note: 'P3 Spike 用', date: null, time: null, priority: 'medium', tags: ['t1'], reminders: [], repeat: null },
  { id: 'e1', title: '更新简历', note: '', date: '2026-11-01', time: null, priority: 'none', tags: ['t5'], reminders: [], repeat: null, done: true, doneAt: '2026-11-01 21:10' },
  { id: 'e2', title: '项目A 原型初稿', note: '', date: '2026-10-31', time: null, priority: 'high', tags: ['t3'], reminders: [], repeat: null, done: true, doneAt: '2026-10-31 17:45' },
  { id: 'f1', title: '旧的会议纪要', note: '', date: '2026-10-20', time: null, priority: 'none', tags: ['t1'], reminders: [], repeat: null, deleted: true, deletedAt: '2026-10-28' },
];

// 统计用完成记录：确定性伪随机，覆盖最近 70 天
function seedLogs() {
  const logs = [];
  const titles = ['回复邮件', '整理文档', '晨跑', '背单词', '周会纪要', '代码评审', '阅读 30 分钟', '采购日用品', '修复缺陷', '写周报'];
  const tagPool = ['t2', 't3', 't4', 't6', 't7', 't9', 't10', null];
  let s = 7;
  const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const base = new Date(2026, 10, 2);
  for (let d = 70; d >= 1; d--) {
    const day = new Date(base); day.setDate(base.getDate() - d);
    const weekend = day.getDay() === 0 || day.getDay() === 6;
    const n = Math.floor(rnd() * (weekend ? 4 : 8)) + (weekend ? 0 : 1);
    for (let i = 0; i < n; i++) {
      const h = 7 + Math.floor(rnd() * 15);
      const m = Math.floor(rnd() * 60);
      logs.push({
        title: titles[Math.floor(rnd() * titles.length)],
        tag: tagPool[Math.floor(rnd() * tagPool.length)],
        at: `${ymd(day)} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
      });
    }
  }
  return logs;
}

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
