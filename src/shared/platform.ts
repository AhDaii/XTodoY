// 平台差异：快捷键的修饰键与显示方式（NFR-POR-01）

export type Platform = 'win32' | 'darwin' | 'linux' | string;

export const isMac = (p: Platform): boolean => p === 'darwin';

/** 主修饰键是否按下：macOS 用 ⌘，其他平台用 Ctrl */
export const modPressed = (p: Platform, e: { ctrlKey: boolean; metaKey: boolean }): boolean =>
  isMac(p) ? e.metaKey : e.ctrlKey;

/**
 * 界面上显示的快捷键：统一按 Windows 写法书写（Ctrl+N、Alt+↑↓），macOS 上换成 ⌘N、⌥↑↓。
 * 只替换修饰键前缀，不改动后面的按键名。
 */
export function shortcutLabel(p: Platform, s: string): string {
  if (!isMac(p)) return s;
  return s
    .replace(/Ctrl\+/g, '⌘')
    .replace(/Alt\+/g, '⌥')
    .replace(/Shift\+/g, '⇧');
}

/** Electron Accelerator 的显示：Super 在 Windows 上叫 Win，在 macOS 上是 ⌘ */
export function acceleratorLabel(p: Platform, acc: string): string {
  if (isMac(p)) return acc.replace('Super+', '⌘').replace('Ctrl+', '⌃').replace('Alt+', '⌥').replace('Shift+', '⇧');
  return acc.replace('Super', p === 'win32' ? 'Win' : 'Super');
}

/** 全局快捷键默认值（FR-SET-08）：macOS 上 ⌘⌥T，其他平台 Ctrl+Alt+T */
export const defaultQuickAddShortcut = (p: Platform): string => (isMac(p) ? 'Super+Alt+T' : 'Ctrl+Alt+T');
