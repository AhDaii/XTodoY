import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let app: ElectronApplication;
let dataDir: string;

async function windowByPage(page: 'main' | 'floating'): Promise<Page> {
  const find = () => app.windows().find((w) => w.url().includes(`/${page}/index.html`));
  await expect.poll(() => Boolean(find()), { timeout: 15_000 }).toBe(true);
  const w = find()!;
  await w.waitForLoadState('domcontentloaded');
  return w;
}

async function addTodo(main: Page, title: string) {
  const input = main.getByPlaceholder('添加待办，回车保存');
  await input.fill(title);
  await input.press('Enter');
  await expect(main.locator('.todo', { hasText: title })).toBeVisible();
}

test.beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'xtodoy-e2e-'));
  app = await electron.launch({ args: ['.'], env: { ...process.env, XTODOY_DATA_DIR: dataDir } });
});

test.afterEach(async () => {
  await app.close();
  rmSync(dataDir, { recursive: true, force: true });
});

test('在"今天"新建待办：列表、侧边栏计数、悬浮窗同步', async () => {
  const main = await windowByPage('main');
  const floating = await windowByPage('floating');
  await expect(main.getByRole('heading', { name: '今天', exact: true })).toBeVisible();
  await expect(main.getByText('今天没有到期的事项')).toBeVisible();

  await addTodo(main, '评审界面原型');
  await expect(main.locator('.nav-item', { hasText: '今天' }).locator('.count')).toHaveText('1');
  await expect(floating.locator('#n')).toHaveText('1');
});

test('勾选完成后可撤销；全部完成时显示完成状态', async () => {
  const main = await windowByPage('main');
  const floating = await windowByPage('floating');
  await addTodo(main, '回复客户邮件');

  await main.getByRole('checkbox', { name: '完成：回复客户邮件' }).click();
  await expect(main.getByText('今天的事都做完了')).toBeVisible();
  await expect(floating.locator('#lbl')).toHaveText('全部完成');

  await main.getByRole('button', { name: '撤销' }).click();
  await expect(main.getByRole('checkbox', { name: '完成：回复客户邮件' })).toHaveAttribute('aria-checked', 'false');
  await expect(floating.locator('#n')).toHaveText('1');
});

test('详情面板：改标题、设日期、设优先级，删除后进回收站并可恢复', async () => {
  const main = await windowByPage('main');
  await addTodo(main, '写周报');
  await main.locator('.todo', { hasText: '写周报' }).click();

  const title = main.getByLabel('标题');
  await title.fill('写本周周报');
  await title.press('Enter');
  await expect(main.locator('.todo .text', { hasText: '写本周周报' })).toBeVisible();

  await main.getByRole('button', { name: '高' }).click();
  await expect(main.locator('.todo .check')).toHaveClass(/prio-high/);

  await main.locator('.prop', { hasText: '日期' }).click();
  await main.getByRole('button', { name: '明天' }).click();
  await expect(main.getByText('今天没有到期的事项')).toBeVisible(); // 改到明天后离开"今天"
  await main.getByRole('button', { name: /计划/ }).first().click();
  await expect(main.locator('.group-title', { hasText: '明天' })).toBeVisible();

  await main.locator('.todo', { hasText: '写本周周报' }).hover();
  await main.getByRole('button', { name: '删除 写本周周报' }).click();
  await main.getByRole('button', { name: /回收站/ }).click();
  await expect(main.locator('.todo', { hasText: '写本周周报' })).toBeVisible();
  await main.getByRole('button', { name: '恢复' }).click();
  await expect(main.getByText('回收站是空的')).toBeVisible();
});

test('多级标签：新建、挂到待办、按父标签浏览包含子标签', async () => {
  const main = await windowByPage('main');
  await main.getByRole('button', { name: '标签管理' }).click();
  await main.getByRole('main').getByRole('button', { name: '新建标签' }).click();
  const rename = main.getByLabel('标签名称');
  await rename.fill('工作');
  await rename.press('Enter');
  await main.getByRole('button', { name: '在 工作 下新建子标签' }).click();
  await main.getByLabel('标签名称').fill('项目A');
  await main.getByLabel('标签名称').press('Enter');
  await expect(main.locator('.tag-row', { hasText: '项目A' })).toContainText('L2');

  // 在子标签视图里新建的待办自动挂上该标签
  await main.locator('.sidebar [role="treeitem"] .nav-item', { hasText: '项目A' }).click();
  await addTodo(main, '设计评审');
  await main.locator('.sidebar [role="treeitem"] .nav-item', { hasText: '工作' }).first().click();
  await expect(main.locator('.todo', { hasText: '设计评审' })).toBeVisible();
  await main.getByRole('button', { name: '仅本标签' }).click();
  await expect(main.getByText('这个标签下没有未完成事项')).toBeVisible();
});

test('删除父标签时子标签上移一级，待办保留', async () => {
  const main = await windowByPage('main');
  await main.getByRole('button', { name: '标签管理' }).click();
  await main.getByRole('main').getByRole('button', { name: '新建标签' }).click();
  await main.getByLabel('标签名称').fill('个人');
  await main.getByLabel('标签名称').press('Enter');
  await main.getByRole('button', { name: '在 个人 下新建子标签' }).click();
  await main.getByLabel('标签名称').fill('健身');
  await main.getByLabel('标签名称').press('Enter');

  await main.getByRole('button', { name: '删除 个人' }).click();
  await expect(main.getByRole('dialog')).toContainText('子标签上移一级');
  await main.getByRole('dialog').getByRole('button', { name: '删除' }).click();
  await expect(main.locator('.tag-row', { hasText: '健身' })).not.toContainText('L2');
  await expect(main.locator('.tag-row', { hasText: '个人' })).toHaveCount(0);
});

test('主题设置同时作用于主窗口和悬浮窗，并在重启后保留', async () => {
  const main = await windowByPage('main');
  const floating = await windowByPage('floating');
  await main.getByRole('button', { name: '设置' }).click();
  await main.getByRole('button', { name: '深色' }).click();
  await expect(main.locator('html')).toHaveClass(/dark/);
  await expect(floating.locator('html')).toHaveClass(/dark/);

  await app.close();
  app = await electron.launch({ args: ['.'], env: { ...process.env, XTODOY_DATA_DIR: dataDir } });
  const again = await windowByPage('main');
  await expect(again.locator('html')).toHaveClass(/dark/);
});

test('关闭主窗口后程序继续运行，单击悬浮窗重新打开主窗口', async () => {
  const main = await windowByPage('main');
  await main.close();
  const remaining = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
  expect(remaining).toBe(1);

  const floating = await windowByPage('floating');
  const reopened = app.waitForEvent('window');
  await floating.locator('#tile').click();
  const again = await reopened;
  await again.waitForLoadState('domcontentloaded');
  expect(again.url()).toContain('/main/index.html');
});

test('渲染进程拿不到 Node，主进程拒绝不合法的输入', async () => {
  const main = await windowByPage('main');
  const probe = await main.evaluate(async () => ({
    require: typeof (globalThis as { require?: unknown }).require,
    process: typeof (globalThis as { process?: unknown }).process,
    bad: await window.xtodoy.todos.create({ title: '', evil: 1 } as never),
    long: await window.xtodoy.todos.create({ title: 'x'.repeat(201) }),
  }));
  expect(probe.require).toBe('undefined');
  expect(probe.process).toBe('undefined');
  expect(probe.bad).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
  expect(probe.long).toMatchObject({ ok: false, error: { message: '标题不能超过 200 个字符' } });
});

test('所有滚动区域都占满所在列，滚动条贴在列的右侧', async () => {
  const main = await windowByPage('main');
  await main.setViewportSize({ width: 1000, height: 600 });
  await addTodo(main, '用于打开详情面板');
  await main.locator('.todo').first().click();

  const pages: [string, () => Promise<void>][] = [
    ['今天 + 详情面板', async () => {}],
    ['标签管理', () => main.getByRole('button', { name: '标签管理' }).click()],
    ['设置', () => main.getByRole('button', { name: '设置' }).click()],
  ];
  for (const [name, open] of pages) {
    await open();
    const gaps = await main.evaluate(() =>
      [
        ['.main-scroll', '.main'],
        ['.detail-body', '.detail'],
        ['.sidebar nav', '.sidebar'],
      ].flatMap(([scroller, column]) => {
        const s = document.querySelector(scroller!);
        const c = document.querySelector(column!);
        if (!s || !c) return [];
        return [{ scroller, gap: Math.round(c.getBoundingClientRect().right - s.getBoundingClientRect().right) }];
      }),
    );
    for (const g of gaps) expect(g.gap, `${name}：${g.scroller} 右侧留白`).toBeLessThanOrEqual(1);
  }
  // 设置页在 600px 高度下需要滚动，且内容宽度仍受 720px 限制
  const settings = await main.evaluate(() => {
    const s = document.querySelector('.main-scroll')!;
    return {
      scrolls: s.scrollHeight > s.clientHeight,
      section: document.querySelector('.settings > section')!.getBoundingClientRect().width,
    };
  });
  expect(settings.scrolls).toBe(true);
  expect(settings.section).toBeLessThanOrEqual(720);
});
