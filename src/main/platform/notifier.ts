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
export function toastXml(n: ReminderNotice, snoozeMinutes: number): string {
  const id = encodeURIComponent(n.todoId);
  return `<toast launch="xtodoy://open?id=${id}" activationType="protocol">
  <visual><binding template="ToastGeneric">
    <text>${esc(n.title)}</text>
    <text>${esc(n.body)}</text>
  </binding></visual>
  <actions>
    <action content="完成" arguments="xtodoy://complete?id=${id}" activationType="protocol"/>
    <action content="稍后提醒（${snoozeMinutes} 分钟）" arguments="xtodoy://snooze?id=${id}" activationType="protocol"/>
  </actions>
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

export function showReminder(n: ReminderNotice, handlers: NotifierHandlers, snoozeMinutes = 10): Notification {
  const notification =
    process.platform === 'win32'
      ? new Notification({ toastXml: toastXml(n, snoozeMinutes) })
      : new Notification({ title: n.title, body: n.body, actions: [{ type: 'button', text: '完成' }] });
  notification.on('click', () => handlers.open(n.todoId));
  notification.on('action', (_e, index) => (index === 0 ? handlers.complete(n.todoId) : handlers.snooze(n.todoId)));
  notification.show();
  return notification;
}
