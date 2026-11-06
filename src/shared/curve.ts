/**
 * 单调三次插值（Fritsch–Carlson，与 d3 的 curveMonotoneX 相同）生成平滑折线的 SVG 路径。
 *
 * 不用 Catmull-Rom：它在数据突变处会冲过相邻点，例如"5 → 0 → 0"时两个 0 之间的曲线
 * 会弯到 0 以下（#34）。单调插值保证每一段都落在两端点的取值之间，平的地方保持平直。
 * 点的 x 坐标须严格递增。
 */
export function monotonePath(pts: readonly (readonly [number, number])[]): string {
  const n = pts.length;
  if (n < 2) return '';
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const h = (i: number) => xs[i + 1]! - xs[i]!;
  // 各段斜率
  const d = Array.from({ length: n - 1 }, (_, i) => (ys[i + 1]! - ys[i]!) / h(i));
  // 各点切线：两侧斜率异号或任一为 0 时取 0（极值点与平台处不过冲），否则取加权调和平均
  const m = ys.map((_, i) => {
    if (i === 0) return d[0]!;
    if (i === n - 1) return d[n - 2]!;
    const a = d[i - 1]!;
    const b = d[i]!;
    if (a * b <= 0) return 0;
    const w1 = 2 * h(i) + h(i - 1);
    const w2 = h(i) + 2 * h(i - 1);
    return (w1 + w2) / (w1 / a + w2 / b);
  });
  // 端点切线不超过相邻段斜率的 3 倍（保持单调）
  if (n > 2) {
    m[0] = endTangent(d[0]!, m[1]!);
    m[n - 1] = endTangent(d[n - 2]!, m[n - 2]!);
  }
  const r = (v: number) => Math.round(v * 100) / 100;
  let path = `M${r(xs[0]!)},${r(ys[0]!)}`;
  for (let i = 0; i < n - 1; i++) {
    const dx = h(i) / 3;
    path += ` C${r(xs[i]! + dx)},${r(ys[i]! + m[i]! * dx)} ${r(xs[i + 1]! - dx)},${r(ys[i + 1]! - m[i + 1]! * dx)} ${r(xs[i + 1]!)},${r(ys[i + 1]!)}`;
  }
  return path;
}

/** 端点切线：由相邻段斜率与内侧切线外推，限制在单调范围内 */
function endTangent(seg: number, inner: number): number {
  if (seg === 0) return 0;
  const t = (3 * seg - inner) / 2;
  if (t * seg <= 0) return 0;
  return Math.abs(t) > 3 * Math.abs(seg) ? 3 * seg : t;
}
