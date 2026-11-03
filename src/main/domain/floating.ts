// 纯函数：悬浮窗位置（FR-FLT-04）。窗口四周有一圈透明的投影留白（inset），"卡片"才是用户看到的部分

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** 取整，并把 -0 变成 0（Electron 的 setPosition 不接受 -0，rc.1 中拖到屏幕边缘时报错） */
const int = (v: number): number => Math.round(v) | 0;

/** 让卡片完整留在工作区内（拖动过程中调用，卡片不会被拖出屏幕而显示不全） */
export function clampToArea(pos: Point, size: { width: number; height: number }, area: Rect, inset: number): Point {
  const minX = area.x - inset;
  const minY = area.y - inset;
  const maxX = area.x + area.width - size.width + inset;
  const maxY = area.y + area.height - size.height + inset;
  return { x: int(Math.min(Math.max(pos.x, minX), maxX)), y: int(Math.min(Math.max(pos.y, minY), maxY)) };
}

/** 松开时吸附：卡片边缘离工作区边缘不超过 threshold 时贴边 */
export function snapToEdges(
  pos: Point,
  size: { width: number; height: number },
  area: Rect,
  inset: number,
  threshold = 20,
): Point {
  const c = clampToArea(pos, size, area, inset);
  const left = c.x + inset - area.x;
  const right = area.x + area.width - (c.x + size.width - inset);
  const top = c.y + inset - area.y;
  const bottom = area.y + area.height - (c.y + size.height - inset);
  let { x, y } = c;
  if (left <= threshold && left <= right) x = area.x - inset;
  else if (right <= threshold) x = area.x + area.width - size.width + inset;
  if (top <= threshold && top <= bottom) y = area.y - inset;
  else if (bottom <= threshold) y = area.y + area.height - size.height + inset;
  return { x: int(x), y: int(y) };
}

/** 记忆的位置是否仍然可见：卡片完整落在某个显示器的工作区内（拔掉副屏后返回 false） */
export function cardVisible(pos: Point, size: { width: number; height: number }, areas: Rect[], inset: number): boolean {
  return areas.some(
    (a) =>
      pos.x + inset >= a.x &&
      pos.y + inset >= a.y &&
      pos.x + size.width - inset <= a.x + a.width &&
      pos.y + size.height - inset <= a.y + a.height,
  );
}
