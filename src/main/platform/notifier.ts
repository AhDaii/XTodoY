import { Notification } from 'electron';

export interface ReminderNotice {
  todoId: string;
  title: string;
  body: string;
}

export interface NotifierHandlers {
  open(todoId: string): void;
  complete(todoId: string): void;
  snooze(todoId: string): void;
}

const esc = (s: string): string =>
  s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);

/**
 * Windows Toast 模板：标题 + 正文 + 「完成」「稍后提醒」两个按钮（FR-REM-03/04）。
 * 按钮使用 protocol 激活，参数形如 xtodoy://complete?id=…，由 second-instance / open-url 回到主进程。
 * 具体可行性见 docs/design/spike-report.md §2。
 */
export function toastXml(n: ReminderNotice, snoozeMinutes: number, sound = true): string {
  const id = encodeURIComponent(n.todoId);
  return `<toast launch="xtodoy://open?id=${id}" activationType="protocol">
  <visual><binding template="ToastGeneric">
    <text>${esc(n.title)}</text>
    <text>${esc(n.body)}</text>
  </binding></visual>
  <actions>
    <action content="完成" arguments="xtodoy://complete?id=${id}" activationType="protocol"/>
    <action content="稍后提醒（${snoozeMinutes} 分钟）" arguments="xtodoy://snooze?id=${id}" activationType="protocol"/>
  </actions>${sound ? '' : '\n  <audio silent="true"/>'}
</toast>`;
}

/** 解析 xtodoy:// 链接（来自通知按钮或二次启动参数） */
export function parseProtocolUrl(url: string): { action: 'open' | 'complete' | 'snooze'; id: string } | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'xtodoy:') return null;
    const action = u.hostname as 'open' | 'complete' | 'snooze';
    const id = u.searchParams.get('id');
    if (!id || !['open', 'complete', 'snooze'].includes(action)) return null;
    return { action, id };
  } catch {
    return null;
  }
}

export interface NotifyOptions {
  snoozeMinutes: number;
  sound: boolean;
}

// 保留通知对象的引用，避免在用户点击前被回收导致回调失效
const alive = new Set<Notification>();
function keep(n: Notification): Notification {
  alive.add(n);
  const drop = (): boolean => alive.delete(n);
  n.on('close', drop);
  n.on('failed', drop);
  setTimeout(drop, 30 * 60_000).unref?.();
  return n;
}

/** 单条提醒（FR-REM-03/04）：Windows 上带「完成」「稍后提醒」按钮 */
export function showReminder(n: ReminderNotice, handlers: NotifierHandlers, opts: NotifyOptions): Notification {
  const notification = keep(
    process.platform === 'win32'
      ? new Notification({ toastXml: toastXml(n, opts.snoozeMinutes, opts.sound) })
      : new Notification({
          title: n.title,
          body: n.body,
          silent: !opts.sound,
          actions: [
            { type: 'button', text: '完成' },
            { type: 'button', text: `稍后提醒（${opts.snoozeMinutes} 分钟）` },
          ],
        }),
  );
  notification.on('click', () => handlers.open(n.todoId));
  notification.on('action', (_e, index) => (index === 0 ? handlers.complete(n.todoId) : handlers.snooze(n.todoId)));
  notification.show();
  return notification;
}

/** 合并补发：错过的提醒超过 3 条时只发一条（FR-REM-07，D-4） */
export function showMissed(count: number, onClick: () => void, sound: boolean): void {
  const n = keep(
    new Notification({
      title: `你错过了 ${count} 个提醒`,
      body: '电脑休眠或暂停期间到期的提醒已合并，单击查看"今天"。',
      silent: !sound,
    }),
  );
  n.on('click', onClick);
  n.show();
}

/** 一般信息通知（例如首次关闭主窗口时的提示） */
export function showInfo(title: string, body: string, onClick?: () => void): void {
  const n = keep(new Notification({ title, body, silent: true }));
  if (onClick) n.on('click', onClick);
  n.show();
}
