// 界面级性能（不参与 CI）：PERF=1 pnpm exec playwright test perf
// NFR-PERF-05 冷启动 ≤ 2 s；NFR-PERF-03 主窗口打开、"全部"视图 1000 条事项时内存 ≤ 250 MB；NFR-PERF-06 界面勾选 ≤ 100 ms
import { _electron as electron, expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test.skip(!process.env['PERF'], '仅在 PERF=1 时运行');

test('冷启动、1000 条事项时的内存与勾选响应', async () => {
  test.setTimeout(180_000);
  const dataDir = mkdtempSync(join(tmpdir(), 'xtodoy-perf-'));
  const env = { ...process.env, XTODOY_DATA_DIR: dataDir };
  const mainOf = async (app: Awaited<ReturnType<typeof electron.launch>>) => {
    await expect.poll(() => app.windows().find((w) => w.url().includes('/main/')), { timeout: 20_000 }).toBeTruthy();
    return app.windows().find((w) => w.url().includes('/main/'))!;
  };

  // 造数：1000 条未完成事项（一半今天到期）
  let app = await electron.launch({ args: ['.'], env });
  let main = await mainOf(app);
  await main.evaluate(async () => {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    for (let i = 0; i < 1000; i++)
      await window.xtodoy.todos.create({ title: `性能测试事项 ${i}`, dueDate: i % 2 ? today : null } as never);
  });
  await app.close();

  // 冷启动：启动进程到主窗口列表可交互（含 Playwright 自身开销，偏保守）
  const t0 = Date.now();
  app = await electron.launch({ args: ['.'], env });
  main = await mainOf(app);
  await main.locator('.todo').first().waitFor();
  const coldStartMs = Date.now() - t0;

  // "全部"视图 1000 条，等待渲染稳定后采样内存
  await main.locator('.nav-item', { hasText: '全部' }).first().click();
  await expect(main.locator('.todo')).toHaveCount(1000, { timeout: 20_000 });
  await main.waitForTimeout(3000);
  // 与任务管理器"内存（专用工作集）"同口径（SRS NFR-PERF-01~03 的测量方法，见 scripts/measure-memory.mjs）
  const pids = await app.evaluate(({ app }) => app.getAppMetrics().map((p) => p.pid));
  const filter = pids.map((p) => `IDProcess=${p}`).join(' or ');
  const ps = `(Get-CimInstance Win32_PerfFormattedData_PerfProc_Process -Filter '${filter}' | Measure-Object WorkingSetPrivate -Sum).Sum`;
  const privateWorkingSetMB =
    Number(execFileSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).trim()) / 1024 / 1024;

  // 界面勾选：在页面内计时，从单击到列表更新（"全部"只列未完成，完成的一项被移除）；不含 Playwright 轮询间隔
  const toggleMs = await main.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const list = document.querySelector('.main-scroll')!;
        const before = list.querySelectorAll('.todo').length;
        const start = performance.now();
        const obs = new MutationObserver(() => {
          if (list.querySelectorAll('.todo').length !== before) {
            obs.disconnect();
            resolve(performance.now() - start);
          }
        });
        obs.observe(list, { childList: true, subtree: true });
        document.querySelector<HTMLElement>('[aria-label="完成：性能测试事项 999"]')!.click();
      }),
  );
  await app.close();

  const result = {
    coldStartMs,
    toggleMs: Math.round(toggleMs),
    privateWorkingSetMB: Math.round(privateWorkingSetMB * 10) / 10,
    budgets: { coldStartMs: 2000, toggleMs: 100, privateWorkingSetMB: 250 },
  };
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/perf-ui.json', JSON.stringify(result, null, 2));
  rmSync(dataDir, { recursive: true, force: true });
  expect(coldStartMs).toBeLessThanOrEqual(2000);
  expect(privateWorkingSetMB).toBeLessThanOrEqual(250);
  expect(toggleMs).toBeLessThanOrEqual(100);
});
