// 全局快捷键（FR-SET-08）：Electron Accelerator 字符串的生成与校验

const MODIFIERS = ['Ctrl', 'Alt', 'Shift', 'Super'] as const;
const NAMED = new Set([
  'Space',
  'Tab',
  'Enter',
  'Backspace',
  'Delete',
  'Insert',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'Up',
  'Down',
  'Left',
  'Right',
]);

const isKey = (k: string): boolean => /^[A-Z0-9]$/.test(k) || /^F([1-9]|1\d|2[0-4])$/.test(k) || NAMED.has(k);

/** 形如 Ctrl+Alt+T：修饰键按固定顺序、至少含 Ctrl / Alt / Super 之一（只按 Shift 会与正常输入冲突），最后是一个按键 */
export function isValidAccelerator(s: string): boolean {
  const parts = s.split('+');
  const key = parts.pop();
  if (!key || !isKey(key) || parts.length === 0) return false;
  const order = parts.map((p) => MODIFIERS.indexOf(p as (typeof MODIFIERS)[number]));
  if (order.some((i) => i < 0) || order.some((i, n) => n > 0 && i <= order[n - 1]!)) return false;
  return parts.some((p) => p !== 'Shift');
}

/** 键盘事件 → Accelerator；只按了修饰键或组合不合法时返回 null */
export function acceleratorFromEvent(e: {
  key: string;
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}): string | null {
  let key: string | null = null;
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  else if (/^Digit\d$/.test(e.code)) key = e.code.slice(5);
  else if (/^F\d{1,2}$/.test(e.code)) key = e.code;
  else if (e.code === 'Space') key = 'Space';
  else if (e.key.startsWith('Arrow')) key = e.key.slice(5);
  else if (NAMED.has(e.key)) key = e.key;
  if (!key) return null;
  const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Super'].filter(Boolean);
  const acc = [...mods, key].join('+');
  return isValidAccelerator(acc) ? acc : null;
}

/** 界面显示：Super 在 Windows 上显示为 Win */
export const displayAccelerator = (s: string): string => s.replace('Super', 'Win');
