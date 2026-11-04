import { app, shell } from 'electron';
import { execFile } from 'node:child_process';
import { APP_USER_MODEL_ID } from '../app/paths';
import { parseRegDword } from '../domain/winreg';

export type NotificationStatus = 'allowed' | 'denied' | 'unknown';

const AUMID = APP_USER_MODEL_ID;

function regQuery(key: string, value: string): Promise<number | null> {
  return new Promise((resolve) => {
    execFile('reg.exe', ['query', key, '/v', value], { windowsHide: true, timeout: 3000 }, (err, stdout) =>
      resolve(err ? null : parseRegDword(stdout, value)),
    );
  });
}

/**
 * 通知是否被系统关闭（FR-REM-09）。Windows 读取两个开关（只读）：
 * 全局"通知"开关 PushNotifications\ToastEnabled，以及本软件的 Notifications\Settings\<AUMID>\Enabled。
 * 其他平台无法可靠检测，返回 unknown。勿扰 / 专注模式无公开接口，界面上以说明文字提示。
 */
export async function notificationStatus(): Promise<NotificationStatus> {
  const forced = process.env['XTODOY_NOTIFY_STATUS'];
  if (!app.isPackaged && (forced === 'allowed' || forced === 'denied' || forced === 'unknown')) return forced;
  if (process.platform !== 'win32') return 'unknown';
  const base = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion';
  const [global, own] = await Promise.all([
    regQuery(`${base}\\PushNotifications`, 'ToastEnabled'),
    regQuery(`${base}\\Notifications\\Settings\\${AUMID}`, 'Enabled'),
  ]);
  return global === 0 || own === 0 ? 'denied' : 'allowed';
}

/** 打开系统的通知设置页 */
export async function openNotificationSettings(): Promise<void> {
  if (process.platform === 'win32') await shell.openExternal('ms-settings:notifications');
  else if (process.platform === 'darwin')
    await shell.openExternal('x-apple.systempreferences:com.apple.preference.notifications');
}
