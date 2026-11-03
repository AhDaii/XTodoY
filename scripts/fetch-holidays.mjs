// 更新内置的节假日数据（开发时运行，结果提交到仓库）：node scripts/fetch-holidays.mjs [起始年] [结束年]
// 数据来自 https://github.com/NateScarlet/holiday-cn ；程序运行时还会每周联网更新本年与下一年（可在设置中关闭）
import { writeFileSync } from 'node:fs';

const from = Number(process.argv[2] ?? 2024);
const to = Number(process.argv[3] ?? new Date().getFullYear() + 1);
const out = [];
for (let y = from; y <= to; y++) {
  const res = await fetch(`https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/${y}.json`);
  if (!res.ok) continue;
  const d = await res.json();
  if (!d.days?.length) continue; // 尚未公布
  out.push({ year: d.year, days: d.days.map(({ name, date, isOffDay }) => ({ name, date, isOffDay })) });
  console.log(y, d.days.length, '天');
}
writeFileSync('src/main/data/holidays.json', JSON.stringify(out, null, 1) + '\n');
