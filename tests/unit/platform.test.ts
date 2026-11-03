import { describe, expect, it } from 'vitest';
import { acceleratorLabel, defaultQuickAddShortcut, modPressed, shortcutLabel } from '../../src/shared/platform';

describe('平台差异（NFR-POR-01）', () => {
  it('macOS 上主修饰键是 ⌘，其他平台是 Ctrl', () => {
    expect(modPressed('darwin', { ctrlKey: true, metaKey: false })).toBe(false);
    expect(modPressed('darwin', { ctrlKey: false, metaKey: true })).toBe(true);
    expect(modPressed('win32', { ctrlKey: true, metaKey: false })).toBe(true);
    expect(modPressed('linux', { ctrlKey: false, metaKey: true })).toBe(false);
  });

  it('快捷键显示按平台转换', () => {
    expect(shortcutLabel('darwin', 'Ctrl+N')).toBe('⌘N');
    expect(shortcutLabel('darwin', '拖动或 Alt+↑↓ 调整')).toBe('拖动或 ⌥↑↓ 调整');
    expect(shortcutLabel('win32', 'Ctrl+N')).toBe('Ctrl+N');
    expect(acceleratorLabel('darwin', 'Super+Alt+T')).toBe('⌘⌥T');
    expect(acceleratorLabel('win32', 'Super+Shift+K')).toBe('Win+Shift+K');
    expect(acceleratorLabel('linux', 'Ctrl+Alt+T')).toBe('Ctrl+Alt+T');
  });

  it('全局快捷键默认值：macOS ⌘⌥T，其他 Ctrl+Alt+T', () => {
    expect(defaultQuickAddShortcut('darwin')).toBe('Super+Alt+T');
    expect(defaultQuickAddShortcut('win32')).toBe('Ctrl+Alt+T');
  });
});
