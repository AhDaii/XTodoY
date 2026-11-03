import { app } from 'electron';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * 开机自启（FR-BG-05）：只在安装版注册，开发环境不改动系统登录项。
 * Windows / macOS 用系统登录项；Linux 没有对应接口，写入 XDG 自启动目录的 .desktop 文件。
 */
export function applyAutostart(on: boolean): void {
  if (!app.isPackaged) return;
  if (process.platform === 'linux') return linuxAutostart(on);
  app.setLoginItemSettings({ openAtLogin: on, args: ['--hidden'] });
}

function linuxAutostart(on: boolean): void {
  const dir = join(process.env['XDG_CONFIG_HOME'] ?? join(homedir(), '.config'), 'autostart');
  const file = join(dir, 'xtodoy.desktop');
  if (!on) return rmSync(file, { force: true });
  // AppImage 运行时 execPath 指向临时挂载点，需用 APPIMAGE 环境变量给出的真实路径
  const exec = process.env['APPIMAGE'] ?? process.execPath;
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    file,
    [
      '[Desktop Entry]',
      'Type=Application',
      'Name=XTodoY',
      `Exec="${exec}" --hidden`,
      'X-GNOME-Autostart-enabled=true',
      '',
    ].join('\n'),
  );
}

/** 是否由开机自启启动：Windows / Linux 带 --hidden 参数；macOS 登录项不能带参数，用 wasOpenedAtLogin 判断 */
export function startedAtLogin(): boolean {
  if (process.argv.includes('--hidden')) return true;
  return process.platform === 'darwin' && app.getLoginItemSettings().wasOpenedAtLogin === true;
}
