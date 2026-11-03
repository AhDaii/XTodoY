import { app, globalShortcut } from 'electron';

let current: string | null = null;

/**
 * 注册"快速新建"全局快捷键（FR-SET-08），替换之前注册的快捷键。
 * 被其他程序占用时注册失败：保留原来的快捷键并返回 false。
 */
export function applyQuickAddShortcut(accelerator: string | null, onPress: () => void): boolean {
  if (accelerator === current) return true;
  if (accelerator) {
    let ok: boolean;
    try {
      ok = globalShortcut.register(accelerator, onPress);
    } catch {
      ok = false; // 系统不支持的组合
    }
    if (!ok) return false;
  }
  if (current) globalShortcut.unregister(current);
  current = accelerator;
  return true;
}

export function quickAddShortcut(): string | null {
  return current;
}

app.on('will-quit', () => globalShortcut.unregisterAll());
