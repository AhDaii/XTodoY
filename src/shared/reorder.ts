import type { Todo } from './types';

/**
 * 把 dragId 放到 overId 之前（after=false）或之后，返回新位置两侧的事项，供 todo:reorder 计算排序键。
 * 位置没有变化时返回 null。
 */
export function dropNeighbors(
  items: readonly Pick<Todo, 'id'>[],
  dragId: string,
  overId: string,
  after: boolean,
): { afterId: string | null; beforeId: string | null } | null {
  if (dragId === overId) return null;
  const from = items.findIndex((t) => t.id === dragId);
  const rest = items.filter((t) => t.id !== dragId);
  const over = rest.findIndex((t) => t.id === overId);
  if (from < 0 || over < 0) return null;
  const at = over + (after ? 1 : 0);
  if (at === from) return null;
  return { afterId: rest[at - 1]?.id ?? null, beforeId: rest[at]?.id ?? null };
}

/** 键盘移动（Alt+↑ / Alt+↓）：与相邻事项交换位置 */
export function stepNeighbors(
  items: readonly Pick<Todo, 'id'>[],
  id: string,
  dir: -1 | 1,
): { afterId: string | null; beforeId: string | null } | null {
  const i = items.findIndex((t) => t.id === id);
  const target = items[i + dir];
  if (i < 0 || !target) return null;
  return dropNeighbors(items, id, target.id, dir === 1);
}

/**
 * 比较分数索引排序键：必须按字符编码比较（与 SQLite 的 BINARY 排序一致）。
 * 不能用 localeCompare——它忽略大小写，会把 "Zz" 排到 "a0" 之后，打乱手动顺序。
 */
export const compareSortKeys = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
