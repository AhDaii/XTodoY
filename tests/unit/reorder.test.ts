import { describe, expect, it } from 'vitest';
import { compareSortKeys, dropNeighbors, stepNeighbors } from '../../src/shared/reorder';

const items = ['a', 'b', 'c', 'd'].map((id) => ({ id }));

describe('列表拖拽排序', () => {
  it('放到某项之前 / 之后时给出两侧事项', () => {
    expect(dropNeighbors(items, 'd', 'b', false)).toEqual({ afterId: 'a', beforeId: 'b' });
    expect(dropNeighbors(items, 'a', 'c', true)).toEqual({ afterId: 'c', beforeId: 'd' });
    expect(dropNeighbors(items, 'b', 'a', false)).toEqual({ afterId: null, beforeId: 'a' });
    expect(dropNeighbors(items, 'a', 'd', true)).toEqual({ afterId: 'd', beforeId: null });
  });

  it('位置不变时不发请求', () => {
    expect(dropNeighbors(items, 'b', 'b', true)).toBeNull();
    expect(dropNeighbors(items, 'b', 'c', false)).toBeNull();
    expect(dropNeighbors(items, 'c', 'b', true)).toBeNull();
  });

  it('Alt+↑ / Alt+↓ 与相邻事项交换', () => {
    expect(stepNeighbors(items, 'b', -1)).toEqual({ afterId: null, beforeId: 'a' });
    expect(stepNeighbors(items, 'b', 1)).toEqual({ afterId: 'c', beforeId: 'd' });
    expect(stepNeighbors(items, 'a', -1)).toBeNull();
    expect(stepNeighbors(items, 'd', 1)).toBeNull();
  });
});

describe('compareSortKeys', () => {
  it('按字符编码比较，与分数索引生成的键一致', async () => {
    const { generateKeyBetween } = await import('fractional-indexing');
    let keys = [generateKeyBetween(null, null)];
    for (let i = 0; i < 30; i++) keys = [generateKeyBetween(null, keys[0]!), ...keys];
    expect([...keys].reverse().sort(compareSortKeys)).toEqual(keys);
    expect(compareSortKeys('Zz', 'a0')).toBeLessThan(0);
  });
});
