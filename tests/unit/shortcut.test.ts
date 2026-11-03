import { describe, expect, it } from 'vitest';
import { acceleratorFromEvent, isValidAccelerator } from '../../src/shared/shortcut';

const ev = (code: string, key: string, m: { ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean } = {}) => ({
  code,
  key,
  ctrlKey: !!m.ctrl,
  altKey: !!m.alt,
  shiftKey: !!m.shift,
  metaKey: !!m.meta,
});

describe('全局快捷键', () => {
  it('校验 Accelerator：需含 Ctrl / Alt / Super，修饰键顺序固定', () => {
    expect(isValidAccelerator('Ctrl+Alt+T')).toBe(true);
    expect(isValidAccelerator('Shift+Super+F5')).toBe(true);
    expect(isValidAccelerator('Shift+T')).toBe(false);
    expect(isValidAccelerator('T')).toBe(false);
    expect(isValidAccelerator('Alt+Ctrl+T')).toBe(false);
    expect(isValidAccelerator('Ctrl+Ctrl+T')).toBe(false);
    expect(isValidAccelerator('Ctrl+Alt+')).toBe(false);
    expect(isValidAccelerator('Ctrl+Hyper+T')).toBe(false);
  });

  it('从键盘事件生成（按物理键位，不受输入法与 Shift 影响）', () => {
    expect(acceleratorFromEvent(ev('KeyT', 't', { ctrl: true, alt: true }))).toBe('Ctrl+Alt+T');
    expect(acceleratorFromEvent(ev('Digit1', '!', { ctrl: true, shift: true }))).toBe('Ctrl+Shift+1');
    expect(acceleratorFromEvent(ev('ArrowUp', 'ArrowUp', { alt: true }))).toBe('Alt+Up');
    expect(acceleratorFromEvent(ev('F2', 'F2', { meta: true }))).toBe('Super+F2');
    expect(acceleratorFromEvent(ev('ControlLeft', 'Control', { ctrl: true }))).toBeNull();
    expect(acceleratorFromEvent(ev('KeyA', 'a'))).toBeNull();
  });
});
