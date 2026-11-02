// 生成界面截图供人工比对原型（不参与 CI）：SCREENS=1 pnpm exec playwright test screens
import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test.skip(!process.env['SCREENS'], '仅在 SCREENS=1 时运行');

test('界面截图', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'xtodoy-screens-'));
  const out = process.env['SCREENS_DIR'] ?? 'test-results/screens';
  const app = await electron.launch({ args: ['.'], env: { ...process.env, XTODOY_DATA_DIR: dataDir } });
  const main = await app.firstWindow();
  await expect.poll(() => app.windows().find((w) => w.url().includes('/main/'))).toBeTruthy();
  const w = app.windows().find((x) => x.url().includes('/main/'))!;
  await w.setViewportSize({ width: 1100, height: 720 });
  void main;

  // 准备示例数据
  await w.evaluate(async () => {
    const x = window.xtodoy;
    const today = new Date();
    const d = (n: number) => {
      const t = new Date(today);
      t.setDate(t.getDate() + n);
      return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    };
    const tag = async (name: string, parentId: string | null, color?: string) => {
      const r = await x.tags.create({ name, parentId, ...(color && { color }) } as never);
      return r.ok ? r.data.id : '';
    };
    const work = await tag('工作', null, 'teal');
    const a = await tag('项目A', work);
    const design = await tag('设计', a, 'cyan');
    const b = await tag('项目B', work, 'blue');
    const me = await tag('个人', null, 'violet');
    const fit = await tag('健身', me, 'green');
    await tag('阅读', me, 'amber');
    const make = async (
      title: string,
      dueDate: string | null,
      dueTime: string | null,
      tagIds: string[],
      priority = 0,
    ) => {
      const r = await x.todos.create({ title, dueDate, dueTime, tagIds, priority } as never);
      return r.ok ? r.data.id : '';
    };
    await make('评审 XTodoY 界面原型', d(0), '10:00', [design], 3);
    await make('项目A 周会', d(0), '14:30', [a], 2);
    const run = await make('晨跑 5 公里', d(0), '07:00', [fit]);
    await make('背 30 个单词', d(0), null, [], 1);
    await make('提交 10 月报销', d(-3), null, [work], 2);
    await make('项目B 需求评审', d(1), '15:00', [b], 3);
    await make('读完《人月神话》第 3 章', d(2), null, []);
    await make('研究托盘内存占用', null, null, [work]);
    await x.todos.toggle(run);
  });
  await w.waitForTimeout(500);

  for (const theme of ['light', 'dark'] as const) {
    await w.evaluate((t) => window.xtodoy.settings.set('theme', t), theme);
    await w.locator('.nav-item', { hasText: '今天' }).first().click();
    await w.locator('.todo', { hasText: '评审' }).click();
    await w.waitForTimeout(400);
    await w.screenshot({ path: `${out}/${theme}-today.png` });
    await w.locator('.prop', { hasText: '日期' }).click();
    await w.waitForTimeout(300);
    await w.screenshot({ path: `${out}/${theme}-date.png` });
    await w.keyboard.press('Escape');
    await w.keyboard.press('Escape');
    await w.locator('.nav-item', { hasText: '计划' }).click();
    await w.waitForTimeout(300);
    await w.screenshot({ path: `${out}/${theme}-plan.png` });
    await w.locator('.sidebar-footer .nav-item', { hasText: '标签管理' }).click();
    await w.waitForTimeout(300);
    await w.screenshot({ path: `${out}/${theme}-tags.png` });
    await w.locator('.sidebar-footer .nav-item', { hasText: '设置' }).click();
    await w.waitForTimeout(300);
    await w.screenshot({ path: `${out}/${theme}-settings.png` });
  }
  // 折叠后的图标栏
  await w.evaluate(() => window.xtodoy.settings.set('sidebarCollapsed', true));
  await w.locator('.nav-item[title^="今天"]').click();
  for (const theme of ['light', 'dark'] as const) {
    await w.evaluate((t) => window.xtodoy.settings.set('theme', t), theme);
    await w.waitForTimeout(400);
    await w.screenshot({ path: `${out}/${theme}-rail.png` });
  }
  const floating = app.windows().find((x) => x.url().includes('/floating/'))!;
  await floating.screenshot({ path: `${out}/floating.png` });
  await app.close();
  rmSync(dataDir, { recursive: true, force: true });
});
