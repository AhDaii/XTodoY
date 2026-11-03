// 随机交互测试（不参与 CI）：FUZZ=1 [FUZZ_STEPS=400] [FUZZ_SEED=1] pnpm exec playwright test fuzz
// 用于复现"点着点着界面变成一片底色"（rc.1 反馈）：每步之后检查页面是否还在、收集页面错误与操作记录
import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test.skip(!process.env['FUZZ'], '仅在 FUZZ=1 时运行');

test('随机交互不应导致页面空白或报错', async () => {
  const steps = Number(process.env['FUZZ_STEPS'] ?? 400);
  let seed = Number(process.env['FUZZ_SEED'] ?? 1);
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  test.setTimeout(steps * 1500 + 60_000);

  const dataDir = mkdtempSync(join(tmpdir(), 'xtodoy-fuzz-'));
  const app = await electron.launch({ args: ['.'], env: { ...process.env, XTODOY_DATA_DIR: dataDir } });
  await expect.poll(() => app.windows().find((w) => w.url().includes('/main/'))).toBeTruthy();
  const main = app.windows().find((w) => w.url().includes('/main/'))!;
  const errors: string[] = [];
  main.on('pageerror', (e) => errors.push(`pageerror: ${e.message}\n${e.stack ?? ''}`));
  main.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));

  await main.evaluate(async () => {
    const x = window.xtodoy;
    const d = (n: number) => {
      const t = new Date();
      t.setDate(t.getDate() + n);
      return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    };
    const work = await x.tags.create({ name: '工作', parentId: null });
    const sub = work.ok ? await x.tags.create({ name: '项目A', parentId: work.data.id }) : null;
    for (let i = 0; i < 25; i++) {
      const r = await x.todos.create({
        title: `事项 ${i}`,
        dueDate: i % 4 === 3 ? null : d((i % 9) - 3),
        dueTime: i % 3 === 0 ? '10:00' : null,
        priority: i % 4,
        tagIds: i % 2 && sub?.ok ? [sub.data.id] : [],
      } as never);
      if (r.ok && i % 5 === 0)
        await x.todos.setRepeat(r.data.id, { freq: 'daily', interval: 1, end: { type: 'never' } });
      if (r.ok && i % 7 === 0) await x.todos.toggle(r.data.id);
    }
  });

  const trace: string[] = [];
  const keys = [
    'Escape',
    'Control+1',
    'Control+2',
    'Control+3',
    'Control+4',
    'Control+5',
    'Space',
    'Enter',
    'ArrowDown',
    'ArrowUp',
    'Delete',
    'Control+z',
    'Tab',
  ];
  for (let i = 0; i < steps; i++) {
    const r = rand();
    let action: string;
    try {
      if (r < 0.25) {
        action = `key ${keys[Math.floor(rand() * keys.length)]}`;
        await main.keyboard.press(action.slice(4));
      } else {
        const sel =
          r < 0.45
            ? '.nav-item'
            : r < 0.6
              ? '.todo'
              : r < 0.7
                ? '.check'
                : r < 0.8
                  ? '.prop, .detail button'
                  : 'button:visible, [role="option"]:visible, [role="switch"]';
        const els = main.locator(sel);
        const n = await els.count();
        if (!n) continue;
        const k = Math.floor(rand() * n);
        const el = els.nth(k);
        const label = ((await el.getAttribute('aria-label')) ?? (await el.textContent()) ?? '').trim().slice(0, 30);
        action = `click ${sel.split(',')[0]} #${k} "${label}"`;
        await el.click({ timeout: 1500, force: true });
      }
    } catch {
      continue; // 元素在点击前消失等：忽略
    }
    trace.push(action);
    await main.waitForTimeout(40);
    const alive = await main.evaluate(() => (document.getElementById('root')?.childElementCount ?? 0) > 0);
    if (!alive || errors.length) {
      writeFileSync('test-results/fuzz-trace.txt', [...trace.slice(-40), '', ...errors].join('\n'));
      await main.screenshot({ path: 'test-results/fuzz-fail.png' });
      await app.close();
      throw new Error(
        `第 ${i + 1} 步后${alive ? '出现页面错误' : '页面变为空白'}：\n${errors.join('\n').slice(0, 2000)}`,
      );
    }
  }
  await app.close();
});
