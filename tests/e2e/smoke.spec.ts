import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
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

test('侧边栏底部按钮与 Ctrl+B 折叠为图标栏，状态在重启后保留', async () => {
  const main = await windowByPage('main');
  await addTodo(main, '用于显示角标');
  const toggle = main.locator('#sidebar .sidebar-footer').getByRole('button', { name: /收起侧边栏/ });
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  // 标题栏与页面标题前不再有折叠按钮
  await expect(main.locator('.titlebar, .main-header').getByRole('button', { name: /侧边栏/ })).toHaveCount(0);

  await toggle.click();
  const sidebar = main.locator('#sidebar');
  await expect(sidebar).toHaveClass(/is-rail/);
  await expect.poll(async () => Math.round((await sidebar.boundingBox())!.width)).toBe(56);
  const expand = sidebar.getByRole('button', { name: /展开侧边栏/ });
  await expect(expand).toHaveAttribute('aria-expanded', 'false');
  // 折叠按钮仍在侧边栏最底部
  const [sb, eb] = await Promise.all([sidebar.boundingBox(), expand.boundingBox()]);
  expect(sb!.y + sb!.height - (eb!.y + eb!.height)).toBeLessThan(16);
  // 图标栏仍可导航，名称通过读屏标签提供，"今天"显示数量角标
  await expect(main.locator('.rail-count')).toHaveText('1');
  await main.getByRole('button', { name: '计划，1 项' }).click();
  await expect(main.getByRole('heading', { name: '计划', exact: true })).toBeVisible();

  await app.close();
  app = await electron.launch({ args: ['.'], env: { ...process.env, XTODOY_DATA_DIR: dataDir } });
  const again = await windowByPage('main');
  await expect(again.locator('#sidebar')).toHaveClass(/is-rail/);
  await again.keyboard.press('Control+b');
  await expect(again.locator('#sidebar')).not.toHaveClass(/is-rail/);
});

test('下拉选择：主题化列表，支持鼠标与键盘选择', async () => {
  const main = await windowByPage('main');
  await main.getByRole('button', { name: '设置' }).click();
  await expect(main.locator('select')).toHaveCount(0); // 不再使用原生下拉框

  const week = main.getByRole('combobox', { name: '每周起始日' });
  await expect(week).toHaveText('周一');
  await week.click();
  const list = main.getByRole('listbox');
  await expect(list).toBeVisible();
  await expect(list.getByRole('option', { name: '周一' })).toHaveAttribute('aria-selected', 'true');
  await list.getByRole('option', { name: '周日' }).click();
  await expect(list).toBeHidden();
  await expect(week).toHaveText('周日');

  // 键盘：聚焦后 Enter 打开，方向键移动，Enter 选择
  const close = main.getByRole('combobox', { name: '关闭主窗口时' });
  await close.focus();
  await main.keyboard.press('Enter');
  await expect(main.getByRole('listbox')).toBeVisible();
  // 打开后焦点落在当前选中项上
  await expect(main.getByRole('option', { name: '最小化到托盘' })).toBeFocused();
  await main.keyboard.press('ArrowDown');
  await expect(main.getByRole('option', { name: '退出程序' })).toBeFocused();
  await main.keyboard.press('Enter');
  await expect(close).toContainText('退出程序');
  await expect.poll(() => main.evaluate(async () => (await window.xtodoy.settings.get()).ok)).toBe(true);
  const saved = await main.evaluate(async () => {
    const r = await window.xtodoy.settings.get();
    return r.ok ? [r.data.weekStart, r.data.closeAction] : null;
  });
  expect(saved).toEqual([0, 'quit']);
});

test('循环事项：设置每天循环，完成后进入下一次并可撤销（FR-REC-05）', async () => {
  const main = await windowByPage('main');
  await addTodo(main, '晨跑');
  await main.locator('.todo', { hasText: '晨跑' }).click();
  await main.locator('.prop', { hasText: '循环' }).click();
  await main.getByRole('combobox', { name: '循环类型' }).click();
  await main.getByRole('option', { name: '每天' }).click();
  await expect(main.locator('.popover .summary')).toHaveText('每天');
  await expect(main.locator('.popover .preview-dates li')).toHaveCount(5);
  await main.keyboard.press('Escape');
  await expect(main.locator('.prop', { hasText: '循环' })).toContainText('每天');

  await main.getByRole('checkbox', { name: '完成：晨跑' }).first().click();
  await expect(main.locator('.toast')).toContainText('已完成本次，下一次：明天');
  await expect(main.getByText('今天没有到期的事项')).toBeVisible();
  await main.getByRole('button', { name: '撤销' }).click();
  await expect(main.locator('.todo-list .todo', { hasText: '晨跑' })).toBeVisible();
});

test('提醒：带时间的事项自动加"准时"提醒；可添加自定义提前量', async () => {
  const main = await windowByPage('main');
  await addTodo(main, '周会');
  await main.locator('.todo', { hasText: '周会' }).click();
  await main.locator('.prop', { hasText: '日期' }).click();
  await main.getByLabel('全天').uncheck();
  await main.keyboard.press('Escape');
  await expect(main.locator('.prop', { hasText: '提醒' })).toContainText('准时');
  await expect(main.locator('.todo', { hasText: '周会' }).locator('.ico[title^="提醒"]')).toBeVisible();

  await main.locator('.prop', { hasText: '提醒' }).click();
  await main.getByLabel('提前量').fill('20');
  await main.locator('.popover').getByRole('button', { name: '添加' }).first().click();
  await expect(main.locator('.popover .reminder-list')).toContainText('提前 20 分钟');
  await main.keyboard.press('Escape');
  await expect(main.locator('.prop', { hasText: '提醒' })).toContainText('提前 20 分钟');
});

test('提醒到时发出系统通知（调度器 → 通知）', async () => {
  const main = await windowByPage('main');
  // 在主进程中拦截通知，避免测试时弹出真实通知
  await app.evaluate(({ Notification }) => {
    const g = globalThis as unknown as { __shown: string[] };
    g.__shown = [];
    Notification.prototype.show = function (this: Electron.Notification) {
      g.__shown.push(this.title || 'toast');
    };
  });
  const at = Date.now() + 2500;
  const id = await main.evaluate(async (fireAt) => {
    const r = await window.xtodoy.todos.create({ title: '马上提醒' });
    if (!r.ok) throw new Error(r.error.message);
    await window.xtodoy.todos.setReminders(r.data.id, [{ kind: 'absolute', at: fireAt }]);
    return r.data.id;
  }, at);
  expect(id).toBeTruthy();
  await expect
    .poll(() => app.evaluate(() => (globalThis as unknown as { __shown: string[] }).__shown.length), {
      timeout: 10_000,
    })
    .toBe(1);
});

test('暂停提醒与恢复（FR-BG-06）', async () => {
  const main = await windowByPage('main');
  await main.getByRole('button', { name: '设置' }).click();
  await main.getByRole('button', { name: '暂停 1 小时' }).click();
  await expect(main.locator('.pause-status')).toContainText('已暂停至');
  await main.getByRole('button', { name: '恢复' }).click();
  await expect(main.getByRole('button', { name: '暂停 1 小时' })).toBeVisible();
});

test('悬浮窗透明度设置生效（FR-FLT-05）', async () => {
  const main = await windowByPage('main');
  await windowByPage('floating');
  await main.getByRole('button', { name: '设置' }).click();
  await main.getByRole('combobox', { name: '悬浮窗透明度' }).click();
  await main.getByRole('option', { name: '60%' }).click();
  await expect
    .poll(() =>
      app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((w) => w.webContents.getURL().includes('/floating/'))
          ?.getOpacity(),
      ),
    )
    .toBeCloseTo(0.6, 1);
});

test('硬件加速为可选项：默认关闭，开启后提示重启，重启后生效', async () => {
  const main = await windowByPage('main');
  // 关闭时 Electron 必然报告硬件加速不可用、GPU 合成被禁用（与机器无关）。
  // 开启时能否真正用上 GPU 取决于机器：CI 虚拟机没有可用显卡，app.isHardwareAccelerationEnabled() 仍为 false，
  // 所以开启后断言的是应用自身的决定（AppInfo.hardwareAcceleration，即启动时没有调用 disableHardwareAcceleration）
  const decided = (p: Page) =>
    p.evaluate(async () => {
      const r = await window.xtodoy.appInfo();
      return r.ok ? r.data.hardwareAcceleration : null;
    });
  expect(await decided(main)).toBe(false);
  expect(await app.evaluate(({ app }) => app.isHardwareAccelerationEnabled())).toBe(false);
  expect(await app.evaluate(({ app }) => app.getGPUFeatureStatus().gpu_compositing)).not.toMatch(/^enabled/);

  await main.getByRole('button', { name: '设置' }).click();
  const sw = main.getByRole('switch', { name: '硬件加速' });
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  await expect(main.locator('.restart-hint')).toContainText('重启后生效');
  await expect(main.getByRole('button', { name: '立即重启' })).toBeVisible();
  // 提示的标题与说明应为上下两行（与其他设置项一致），不能挤在同一行
  const title = (await main.locator('.restart-hint .txt b').boundingBox())!;
  const desc = (await main.locator('.restart-hint .txt span').boundingBox())!;
  expect(desc.y).toBeGreaterThanOrEqual(title.y + title.height - 1);

  // "立即重启"会结束当前进程，测试中改为手动关闭再启动
  await app.close();
  app = await electron.launch({ args: ['.'], env: { ...process.env, XTODOY_DATA_DIR: dataDir } });
  const again = await windowByPage('main');
  await again.getByRole('button', { name: '设置' }).click();
  await expect(again.getByRole('switch', { name: '硬件加速' })).toHaveAttribute('aria-checked', 'true');
  await expect(again.locator('.restart-hint')).toHaveCount(0);
  expect(await decided(again)).toBe(true);
});

test('统计：完成后计入日 / 周 / 月统计，明细可跳回事项（FR-STA-02/05）', async () => {
  const main = await windowByPage('main');
  await addTodo(main, '写周报');
  await addTodo(main, '回复邮件');
  await main.getByRole('checkbox', { name: '完成：写周报' }).click();

  await main.locator('.sidebar-footer .nav-item', { hasText: '统计' }).click();
  const dims = main.getByRole('group', { name: '统计维度' });
  // 默认周视图：摘要卡片、到期完成率（今天到期 2 项完成 1 项）
  await expect(main.getByLabel('完成数').locator('.hero-num .num')).toHaveText('1');
  await expect(main.locator('.ring-txt')).toHaveText('50%');
  await expect(main.getByLabel('连续完成天数').locator('.hero-num .num')).toHaveText('1');
  await expect(main.getByRole('img', { name: /本周每天完成数折线图/ })).toBeVisible();

  await dims.getByRole('button', { name: '日' }).click();
  await expect(main.locator('.timeline li')).toHaveCount(1);
  await expect(main.getByRole('button', { name: '下一天' })).toBeDisabled();
  await main.getByRole('button', { name: '上一天' }).click();
  await expect(main.locator('.period')).toHaveText('昨天');
  await expect(main.getByText('这一天还没有完成记录')).toBeVisible();
  await main.getByRole('button', { name: '回到本期' }).click();

  await dims.getByRole('button', { name: '月' }).click();
  await expect(main.locator('.hm-cell.is-today .nn')).toHaveText('1');

  // 取消完成后统计同步减少
  await main.locator('.log-list').getByRole('button', { name: '写周报' }).click();
  await expect(main.locator('.detail')).toBeVisible();
  await main.getByRole('checkbox', { name: '完成：写周报' }).click();
  await main.locator('.sidebar-footer .nav-item', { hasText: '统计' }).click();
  await expect(main.getByLabel('完成数').locator('.hero-num .num')).toHaveText('0');
});

test('数据：导出备份后导入，覆盖前确认并自动备份（FR-SET-06）', async () => {
  const main = await windowByPage('main');
  await addTodo(main, '导出前的待办');
  const file = join(dataDir, 'export.json');
  // 系统文件对话框无法在测试中操作：在主进程中替换为固定路径
  await app.evaluate(({ dialog }, f) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: f })) as typeof dialog.showSaveDialog;
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [f] })) as typeof dialog.showOpenDialog;
  }, file);

  await main.locator('.sidebar-footer .nav-item', { hasText: '设置' }).click();
  await main.getByRole('button', { name: '导出' }).click();
  await expect(main.locator('.toast')).toContainText('已导出到');

  // 导出后新增的待办会被导入覆盖掉
  await main.locator('.nav-item', { hasText: '今天' }).first().click();
  await addTodo(main, '导出后的待办');
  await main.locator('.sidebar-footer .nav-item', { hasText: '设置' }).click();
  await main.getByRole('button', { name: '导入…' }).click();
  const dlg = main.getByRole('dialog', { name: '导入备份' });
  await expect(dlg).toContainText('导入备份将覆盖当前数据');
  await dlg.getByRole('button', { name: '选择文件并导入' }).click();
  await expect(main.locator('.toast')).toContainText('已导入 1 项待办');

  await main.locator('.nav-item', { hasText: '今天' }).first().click();
  await expect(main.locator('.todo', { hasText: '导出前的待办' })).toBeVisible();
  await expect(main.locator('.todo', { hasText: '导出后的待办' })).toHaveCount(0);
  expect(readdirSync(join(dataDir, 'backups')).some((f) => f.startsWith('pre-import-'))).toBe(true);
});
