import { describe, expect, it } from 'vitest';
import { monotonePath } from '../../src/shared/curve';

/** 解析 "M x,y C ... " 路径，按段采样三次贝塞尔，返回每段的端点与采样到的 y 范围 */
function segments(path: string) {
  const nums = path.match(/-?\d+(\.\d+)?/g)!.map(Number);
  let [x0, y0] = [nums[0]!, nums[1]!];
  const out: { from: number; to: number; min: number; max: number }[] = [];
  for (let k = 2; k + 5 < nums.length + 1; k += 6) {
    const [c1x, c1y, c2x, c2y, x1, y1] = nums.slice(k, k + 6) as [number, number, number, number, number, number];
    let min = Infinity;
    let max = -Infinity;
    for (let t = 0; t <= 1.0001; t += 0.02) {
      const u = 1 - t;
      const y = u * u * u * y0 + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y1;
      min = Math.min(min, y);
      max = Math.max(max, y);
    }
    const r = (v: number) => Math.round(v * 1000) / 1000 + 0; // 去掉采样的浮点误差与 -0
    out.push({ from: y0, to: y1, min: r(min), max: r(max) });
    void c1x;
    void c2x;
    [x0, y0] = [x1, y1];
  }
  void x0;
  return out;
}

const pts = (ys: number[]) => ys.map((y, i): [number, number] => [i * 100, y]);

describe('monotonePath（#34 周趋势曲线）', () => {
  it('连续两天都是 0 时两点之间是直线，不会弯到 0 以下', () => {
    // SVG 中 y 向下：值 0 对应 y=200（底部），值 5 对应 y=0
    const segs = segments(monotonePath(pts([0, 200, 200, 80, 200, 200, 200])));
    expect(segs[1]).toMatchObject({ from: 200, to: 200, min: 200, max: 200 });
    expect(segs[4]).toMatchObject({ min: 200, max: 200 });
    expect(segs[5]).toMatchObject({ min: 200, max: 200 });
  });

  it('任何一段都不超出两端点之间（不过冲）', () => {
    for (const ys of [
      [200, 0, 200, 0, 200],
      [10, 200, 190, 30, 200, 200, 5],
      [100, 100, 100],
      [0, 50, 100, 150, 200],
    ]) {
      for (const s of segments(monotonePath(pts(ys)))) {
        expect(s.min).toBeGreaterThanOrEqual(Math.min(s.from, s.to) - 1e-6);
        expect(s.max).toBeLessThanOrEqual(Math.max(s.from, s.to) + 1e-6);
      }
    }
  });

  it('少于两个点时返回空路径；两个点时为直线段', () => {
    expect(monotonePath([])).toBe('');
    expect(monotonePath([[0, 1]])).toBe('');
    expect(segments(monotonePath(pts([0, 200])))[0]).toMatchObject({ min: 0, max: 200 });
  });
});
