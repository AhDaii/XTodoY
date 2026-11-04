import { app, Menu, nativeTheme } from 'electron';
import { join } from 'node:path';
import type { DB } from './db/client';
import { installCrashGuards, openDatabaseOrRecover } from './app/startup';
import { bus } from './events/bus';
import { registerIpc } from './ipc/handlers';
import { parseProtocolUrl, showInfo, showMissed, showReminder } from './platform/notifier';
import { watchPower } from './platform/power';
import { createTray, refreshTrayMenu, updateTrayCount } from './platform/tray';
import {
  applyFloatingPrefs,
  createFloatingWindow,
  onMainWindowClosed,
  setTitleBarTheme,
  showMainWindow,
  windows,
} from './platform/windows';
import { SettingsService } from './services/settings';
import { StatsService } from './services/stats';
import { BackupService } from './services/backup';
import { TagService } from './services/tags';
import { TodayService } from './services/today';
import { TodoService } from './services/todos';
import { Scheduler } from './services/scheduler';
import { notificationBody } from './domain/describe';
import { localDate } from './domain/time';
import { Events, type NavRequest } from '@shared/ipc';
import { runMetricsIfRequested } from './app/metrics';
import { readHardwareAcceleration } from './app/launch-prefs';
import { installFileLog } from './app/log';
import { APP_USER_MODEL_ID } from './app/paths';
import { applyQuickAddShortcut } from './platform/shortcut';
import { applyAutostart, startedAtLogin } from './platform/autostart';
import { createUpdater } from './platform/updater';
import { UpdateService } from './services/update';
import { HolidayService } from './services/holidays';
import { updateNeedsAttention } from '@shared/update';

// 指定了独立数据目录（测试、试用）时，Chromium 配置与单实例锁也随之隔离，不影响正在运行的正式实例
const customDataDir = process.env['XTODOY_DATA_DIR'];
if (customDataDir) app.setPath('userData', join(customDataDir, 'electron'));

// 单实例（FR-BG-04）：第二个实例把参数交给第一个实例后退出
if (!app.requestSingleInstanceLock()) {
  app.exit(0);
}

const dataDir = customDataDir ?? join(app.getPath('userData'), 'data');
// 安装版没有控制台：主进程日志写入数据目录（FR-UPD-09）
if (app.isPackaged) installFileLog(dataDir);
installCrashGuards();

// 硬件加速默认关闭：界面没有重度动画，软件渲染足够，常驻内存约少 20%（spike-report.md §1）。
// 用户可在"设置 › 外观"中开启，重启后生效；XTODOY_ENABLE_GPU=1 可临时强制开启。
const hardwareAcceleration = process.env['XTODOY_ENABLE_GPU'] === '1' || readHardwareAcceleration(dataDir);
if (!hardwareAcceleration) app.disableHardwareAcceleration();

app.setAppUserModelId(APP_USER_MODEL_ID);
// 自定义协议只在安装版中注册，开发环境不改动系统注册表
if (app.isPackaged) app.setAsDefaultProtocolClient('xtodoy');

let db: DB | null = null;
let today: TodayService | null = null;
let settings: SettingsService | null = null;

/** 打开主窗口并让渲染进程切到指定视图（托盘、通知、悬浮窗调用） */
function openMain(nav?: NavRequest): void {
  const win = showMainWindow();
  if (!nav) return;
  const send = (): void => win.webContents.send(Events.navOpen, nav);
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', send);
  else send();
}

// 由 whenReady 中的服务初始化后赋值；通知按钮与二次启动参数都通过它回到主进程
let reminderActions: { complete(id: string): void; snooze(id: string): void } | null = null;

function handleProtocol(argv: string[]): void {
  const url = argv.find((a) => a.startsWith('xtodoy://'));
  const parsed = url ? parseProtocolUrl(url) : null;
  if (!parsed) return;
  if (parsed.action === 'open') openMain({ todoId: parsed.id });
  else if (parsed.action === 'complete') reminderActions?.complete(parsed.id);
  else reminderActions?.snooze(parsed.id);
}

app.on('second-instance', (_e, argv) => {
  if (argv.some((a) => a.startsWith('xtodoy://'))) handleProtocol(argv);
  else openMain();
});

// 关闭所有窗口不退出：托盘常驻（FR-BG-02）；"关闭即退出"在主窗口关闭时处理
app.on('window-all-closed', () => {});

// 退出顺序：before-quit 标记正在退出（窗口关闭回调不再写库、不再发提示）→ 窗口关闭 → will-quit 关闭数据库
let quitting = false;
app.on('before-quit', () => {
  quitting = true;
  today?.stop();
});
app.on('will-quit', () => {
  db?.close();
});

// macOS：通知按钮与 xtodoy:// 链接通过 open-url 事件到达；单击 Dock 图标重新打开主窗口
app.on('open-url', (e, url) => {
  e.preventDefault();
  handleProtocol([url]);
});
const bootAt = Date.now();
app.on('activate', () => {
  // 启动时 macOS 也会发一次 activate：开机自启（只显示菜单栏图标）时忽略这一次
  if (startedAtLogin() && Date.now() - bootAt < 3000) return;
  openMain();
});

void app.whenReady().then(() => {
  // macOS 需要应用菜单，否则输入框里的 ⌘C / ⌘V / ⌘Z 与 ⌘Q 都不可用；其他平台用自绘标题栏，不显示菜单
  Menu.setApplicationMenu(
    process.platform === 'darwin'
      ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }])
      : null,
  );
  const opened = openDatabaseOrRecover(dataDir);
  if (!opened) return app.quit();
  db = opened.db;
  settings = new SettingsService(db);
  const s = settings;
  const tags = new TagService(db);
  const todos = new TodoService(db, tags, () => s.get());
  today = new TodayService(db);
  todos.purgeExpired();
  nativeTheme.themeSource = s.get().theme;

  // ---- 提醒（FR-REM）：调度器 → 系统通知 → 按钮回到待办服务 ----
  const handlers = {
    open: (id: string) => openMain({ todoId: id }),
    complete: (id: string) => {
      try {
        if (todos.get(id).status === 'open') todos.toggle(id);
      } catch {
        // 事项已被删除：忽略
      }
    },
    snooze: (id: string) => scheduler.snooze(id),
  };
  reminderActions = handlers;
  const scheduler = new Scheduler(db, () => s.get(), {
    remind: (ids) => {
      const { snoozeMinutes, reminderSound } = s.get();
      for (const id of ids) {
        const t = todos.get(id);
        showReminder({ todoId: id, title: t.title, body: notificationBody(t, localDate(new Date())) }, handlers, {
          snoozeMinutes,
          sound: reminderSound,
        });
      }
    },
    remindMissed: (ids) => showMissed(ids.length, () => openMain({ view: 'today' }), s.get().reminderSound),
  });

  // 每天首次启动时自动备份（FR-SET-07）；延后执行，不占用启动时间
  const backup = new BackupService(db, dataDir, s, opened.schemaVersion);
  setTimeout(() => {
    try {
      backup.daily();
    } catch (e) {
      console.error('[backup] daily backup failed', e);
    }
  }, 5_000).unref();

  // 全局快捷键：打开主窗口并聚焦快速新建（FR-SET-08）
  const quickAdd = () => openMain({ view: 'today', focus: 'quick-add' });
  if (!applyQuickAddShortcut(s.get().quickAddShortcut, quickAdd))
    console.warn(`[shortcut] ${s.get().quickAddShortcut} 已被其他程序占用`);

  // 更新（SRS F10）：状态推送到主窗口与托盘；通知每个版本最多一次
  const openUpdate = () => openMain({ view: 'settings', focus: 'update' });
  const update = new UpdateService(app.getVersion(), createUpdater(), s, {
    status: (st) => {
      windows.main?.webContents.send(Events.updateStatus, st);
      refreshTrayMenu();
    },
    notify: (kind, version) =>
      kind === 'available'
        ? showInfo(`XTodoY ${version} 可以更新了`, '单击查看更新内容', openUpdate)
        : showInfo(
            'XTodoY 更新已就绪',
            `${version} 已下载并通过校验，重启后生效；不重启则在退出时自动安装`,
            openUpdate,
          ),
    backup: () => backup.snapshot('pre-update'),
  });
  app.on('before-quit', () => update.beforeQuit());

  // 法定节假日（工作日循环）：内置数据 + 每周联网更新，更新后推送给主窗口
  const holidays = new HolidayService(join(dataDir, 'holidays'), s, (data) =>
    windows.main?.webContents.send(Events.holidaysChanged, data),
  );

  registerIpc({
    todos,
    tags,
    settings: s,
    stats: new StatsService(db, () => s.get()),
    backup,
    today,
    scheduler,
    dataDir,
    schemaVersion: opened.schemaVersion,
    hardwareAcceleration,
    applyShortcut: (acc) => applyQuickAddShortcut(acc, quickAdd),
    update,
    holidays,
  });

  bus.on('today.count', updateTrayCount);
  bus.on('time.jumped', () => today?.resync());
  bus.on('reminders.resumed', () => s.set('pausedUntil', null));
  bus.on('settings.changed', (patch) => {
    if (patch.floatingEnabled === true) {
      createFloatingWindow(s.get().floatingPos ?? undefined);
      applyFloatingPrefs({ opacity: s.get().floatingOpacity, locked: s.get().floatingLocked });
    }
    if (patch.floatingOpacity !== undefined || patch.floatingLocked !== undefined) {
      applyFloatingPrefs({ opacity: s.get().floatingOpacity, locked: s.get().floatingLocked });
    }
    if (patch.autostart !== undefined) applyAutostart(patch.autostart);
    if (patch.holidayAutoUpdate !== undefined) holidays.arm();
    refreshTrayMenu();
  });
  nativeTheme.on('updated', () => setTitleBarTheme(nativeTheme.shouldUseDarkColors));
  watchPower();
  today.start();
  scheduler.start();
  update.start();
  holidays.start();
  updateTrayCount(today.current);
  app.on('before-quit', () => scheduler.stop());

  createTray({
    openMain: () => openMain(),
    newTodo: quickAdd,
    toggleFloating: () => s.set('floatingEnabled', windows.floating === null),
    isFloatingVisible: () => windows.floating !== null,
    pauseReminders: (kind) => {
      const d = new Date();
      const until =
        kind === 'hour' ? Date.now() + 3_600_000 : new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
      s.set('pausedUntil', until);
    },
    resumeReminders: () => s.set('pausedUntil', null),
    pausedUntil: () => s.get().pausedUntil,
    checkUpdate: () => {
      openUpdate();
      void update.check(true);
    },
    update: () => {
      const st = update.status;
      if (!updateNeedsAttention(st)) return null;
      return st.phase === 'ready'
        ? { label: '重启以完成更新', ready: true, click: () => update.installNow() }
        : { label: `新版本 ${st.latest} 可用`, ready: false, click: openUpdate };
    },
    openSettings: () => openMain({ view: 'settings' }),
    quit: () => app.quit(),
  });

  onMainWindowClosed(() => {
    if (quitting) return;
    const { closeAction, closeTipShown } = s.get();
    if (closeAction === 'quit') return app.quit();
    // 首次关闭时提示一次仍在后台运行（FR-BG-02）
    if (!closeTipShown) {
      s.set('closeTipShown', true);
      showInfo('XTodoY 仍在后台运行', '可以从托盘图标或悬浮窗重新打开，提醒会照常推送。', () => openMain());
    }
  });

  if (runMetricsIfRequested()) return;

  if (s.get().floatingEnabled) {
    createFloatingWindow(s.get().floatingPos ?? undefined);
    applyFloatingPrefs({ opacity: s.get().floatingOpacity, locked: s.get().floatingLocked });
  }
  // 开机自启时只显示托盘与悬浮窗（FR-BG-05）
  if (!startedAtLogin()) showMainWindow();
  handleProtocol(process.argv);
});
