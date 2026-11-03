import { modPressed, shortcutLabel } from '@shared/platform';

/** 当前平台（由 preload 提供） */
export const platform = window.xtodoy.platform;
// 供 CSS 按平台调整（如 macOS 标题栏左侧留出红绿灯按钮的位置）
document.documentElement.dataset['platform'] = platform;

/** 主修饰键：macOS ⌘ / 其他 Ctrl */
export const mod = (e: { ctrlKey: boolean; metaKey: boolean }): boolean => modPressed(platform, e);

/** 快捷键显示：按 Windows 写法传入（Ctrl+N），macOS 上显示为 ⌘N */
export const kbd = (s: string): string => shortcutLabel(platform, s);
