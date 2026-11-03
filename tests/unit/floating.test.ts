import { describe, expect, it } from 'vitest';
import { cardVisible, clampToArea, snapToEdges } from '../../src/main/domain/floating';

// 窗口 80 × 94，四周 8 px 透明留白；工作区 1920 × 1040（任务栏 40 px）
const size = { width: 80, height: 94 };
const area = { x: 0, y: 0, width: 1920, height: 1040 };
const inset = 8;

describe('悬浮窗位置（FR-FLT-04）', () => {
  it('拖动时卡片不会被拖出工作区（只有透明留白可以超出）', () => {
    expect(clampToArea({ x: -200, y: -50 }, size, area, inset)).toEqual({ x: -8, y: -8 });
    expect(clampToArea({ x: 5000, y: 5000 }, size, area, inset)).toEqual({ x: 1920 - 80 + 8, y: 1040 - 94 + 8 });
    expect(clampToArea({ x: 500, y: 300 }, size, area, inset)).toEqual({ x: 500, y: 300 });
  });

  it('坐标取整且不会出现 -0（rc.1：拖到屏幕上沿时 setPosition 报错）', () => {
    const p = clampToArea({ x: 100, y: -0.3 }, size, { ...area, y: -8 }, 0);
    expect(Object.is(p.y, -0)).toBe(false);
    expect(Number.isInteger(p.x) && Number.isInteger(p.y)).toBe(true);
  });

  it('松开时靠近边缘 20 px 内贴边，否则保持原位', () => {
    // 卡片左边缘离屏幕左边 12 px、上边缘离屏幕上边 30 px：只吸附左边
    expect(snapToEdges({ x: 4, y: 22 }, size, area, inset)).toEqual({ x: -8, y: 22 });
    // 靠近右下角：贴右、贴下
    expect(snapToEdges({ x: 1920 - 80 + 8 - 15, y: 1040 - 94 + 8 - 10 }, size, area, inset)).toEqual({
      x: 1848,
      y: 954,
    });
    expect(snapToEdges({ x: 600, y: 400 }, size, area, inset)).toEqual({ x: 600, y: 400 });
  });

  it('多显示器：吸附到第二块屏幕的边缘（工作区不从 0 开始）', () => {
    const second = { x: 1920, y: 0, width: 1280, height: 984 };
    expect(snapToEdges({ x: 1925, y: 500 }, size, second, inset)).toEqual({ x: 1912, y: 500 });
  });

  it('记忆位置可见性按卡片判断：贴边的位置有效，副屏拔掉后无效', () => {
    expect(cardVisible({ x: -8, y: -8 }, size, [area], inset)).toBe(true);
    expect(cardVisible({ x: -9, y: 100 }, size, [area], inset)).toBe(false);
    expect(cardVisible({ x: 2500, y: 100 }, size, [area], inset)).toBe(false);
  });
});
