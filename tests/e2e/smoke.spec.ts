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

test.beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'xtodoy-e2e-'));
  app = await electron.launch({ args: ['.'], env: { ...process.env, XTODOY_DATA_DIR: dataDir } });
});

test.afterEach(async () => {
  await app.close();
  rmSync(dataDir, { recursive: true, force: true });
});

test('启动后显示主窗口与悬浮窗，新增今天的待办后两处计数同步', async () => {
  const main = await windowByPage('main');
  const floating = await windowByPage('floating');

  await expect(main.getByText('今日待办（仅今天到期）')).toBeVisible();
  await expect(floating.locator('#n')).toHaveText('0');

  await main.getByLabel('待办标题').fill('评审界面原型');
  await main.getByLabel('待办标题').press('Enter');

  await expect(main.locator('.text-4xl')).toHaveText('1');
  await expect(floating.locator('#n')).toHaveText('1');
  await expect(floating.locator('#tile')).toHaveAttribute('title', '今日已完成 0 / 共 1');
});

test('主题切换同时作用于主窗口和悬浮窗', async () => {
  const main = await windowByPage('main');
  const floating = await windowByPage('floating');
  await main.getByRole('button', { name: '深色' }).click();
  await expect(main.locator('html')).toHaveClass(/dark/);
  await expect(floating.locator('html')).toHaveClass(/dark/);
  await main.getByRole('button', { name: '浅色' }).click();
  await expect(main.locator('html')).not.toHaveClass(/dark/);
  await expect(floating.locator('html')).not.toHaveClass(/dark/);
});

test('关闭主窗口后程序继续运行，单击悬浮窗重新打开主窗口', async () => {
  const main = await windowByPage('main');
  await main.close();

  const remaining = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
  expect(remaining).toBe(1); // 只剩悬浮窗，主窗口已销毁

  const floating = await windowByPage('floating');
  const reopened = app.waitForEvent('window');
  await floating.locator('#tile').click();
  const again = await reopened;
  await again.waitForLoadState('domcontentloaded');
  expect(again.url()).toContain('/main/index.html');
});

test('预加载脚本只暴露白名单 API，渲染进程拿不到 Node', async () => {
  const main = await windowByPage('main');
  const probe = await main.evaluate(() => ({
    require: typeof (globalThis as { require?: unknown }).require,
    process: typeof (globalThis as { process?: unknown }).process,
    api: Object.keys(window.xtodoy).sort(),
  }));
  expect(probe.require).toBe('undefined');
  expect(probe.process).toBe('undefined');
  expect(probe.api).toContain('getToday');
});
