// 窗口背景图（#41，设计系统 §7.12，方案见 design/prototype/background-variants.html）

export type BackgroundPosition = 'center' | 'top' | 'bottom';
export const BACKGROUND_POSITIONS: readonly BackgroundPosition[] = ['center', 'top', 'bottom'];

export interface BackgroundSettings {
  /** null 为无背景；'preset:<id>' 为内置背景；'custom:<文件名>' 为用户上传（保存在 <数据目录>/backgrounds/） */
  image: string | null;
  /** 模糊，0–40 px */
  blur: number;
  /** 与主题同色的遮罩（浅色提亮、深色压暗），0–0.7 */
  dim: number;
  /** 侧边栏、内容区等面板的不透明度，0.4–1 */
  panel: number;
  /** 图片裁剪时的对齐位置 */
  position: BackgroundPosition;
}

export const DEFAULT_BACKGROUND: BackgroundSettings = {
  image: null,
  blur: 6,
  dim: 0.1,
  panel: 0.72,
  position: 'center',
};

/** 上传的图片保存为 custom-<时间戳>.jpg；只接受这种文件名，避免读取数据目录以外的文件 */
export const CUSTOM_BACKGROUND_FILE = /^custom-\d{10,16}\.jpg$/;

export interface BackgroundPreset {
  id: string;
  name: string;
  /** 偏深色的图：横幅等处使用浅色文字 */
  dark: boolean;
  svg: string;
}

const W = 1600;
const H = 1000;
const wrap = (body: string) =>
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${W} ${H}' preserveAspectRatio='xMidYMid slice'>${body}</svg>`;

/**
 * 内置背景：全部用代码绘制的矢量图（SVG），任意分辨率都清晰，没有版权问题，几乎不占安装包体积。
 */
export const BACKGROUND_PRESETS: readonly BackgroundPreset[] = [
  {
    id: 'mist',
    name: '晨雾',
    dark: false,
    svg: wrap(
      `<defs><filter id='b'><feGaussianBlur stdDeviation='120'/></filter></defs><rect width='${W}' height='${H}' fill='#eef2ff'/><g filter='url(#b)'><circle cx='300' cy='250' r='380' fill='#c7d2fe'/><circle cx='1250' cy='200' r='420' fill='#fbcfe8'/><circle cx='900' cy='850' r='450' fill='#bae6fd'/><circle cx='200' cy='900' r='300' fill='#ddd6fe'/></g>`,
    ),
  },
  {
    id: 'aurora',
    name: '极光',
    dark: true,
    svg: wrap(
      `<defs><filter id='b'><feGaussianBlur stdDeviation='60'/></filter><linearGradient id='s' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#020617'/><stop offset='1' stop-color='#0b1d3a'/></linearGradient></defs><rect width='${W}' height='${H}' fill='url(#s)'/><g filter='url(#b)' opacity='.85'><path d='M-100 520 C 300 300, 600 650, 1000 420 S 1600 300, 1800 450 L1800 620 C 1400 520, 1100 760, 700 640 S 100 560, -100 700Z' fill='#10b981'/><path d='M-100 380 C 400 200, 800 480, 1200 300 S 1700 260, 1800 320 L1800 420 C 1300 380, 900 600, 500 470 S 0 420,-100 500Z' fill='#6366f1'/></g><g fill='#fff' opacity='.7'><circle cx='180' cy='120' r='1.6'/><circle cx='520' cy='80' r='1.2'/><circle cx='860' cy='160' r='1.4'/><circle cx='1300' cy='90' r='1.8'/><circle cx='1480' cy='210' r='1.1'/><circle cx='1100' cy='60' r='1.2'/></g>`,
    ),
  },
  {
    id: 'hills',
    name: '远山',
    dark: false,
    svg: wrap(
      `<defs><linearGradient id='s' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#dbeafe'/><stop offset='1' stop-color='#fef3c7'/></linearGradient></defs><rect width='${W}' height='${H}' fill='url(#s)'/><circle cx='1180' cy='360' r='90' fill='#fde68a' opacity='.9'/><path d='M0 640 L220 470 L420 590 L700 380 L980 560 L1220 430 L1600 600 V1000 H0Z' fill='#93c5fd' opacity='.7'/><path d='M0 760 L260 600 L520 720 L820 560 L1100 700 L1380 580 L1600 680 V1000 H0Z' fill='#60a5fa' opacity='.8'/><path d='M0 880 L300 760 L640 860 L960 740 L1300 850 L1600 780 V1000 H0Z' fill='#2563eb' opacity='.85'/>`,
    ),
  },
  {
    id: 'waves',
    name: '海浪',
    dark: false,
    svg: wrap(
      `<rect width='${W}' height='${H}' fill='#ecfeff'/><g fill='none' stroke-width='3'>${Array.from(
        { length: 14 },
        (_, i) =>
          `<path d='M-50 ${180 + i * 60} C 300 ${120 + i * 60}, 500 ${260 + i * 60}, 800 ${180 + i * 60} S 1300 ${110 + i * 60}, 1650 ${190 + i * 60}' stroke='hsl(${190 + i * 3} 70% ${78 - i * 2.5}%)'/>`,
      ).join('')}</g>`,
    ),
  },
  {
    id: 'sand',
    name: '暖沙',
    dark: false,
    svg: wrap(
      `<defs><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .55  0 0 0 0 .45  0 0 0 0 .35  0 0 0 .08 0'/></filter><radialGradient id='g' cx='.3' cy='.2' r='1'><stop offset='0' stop-color='#fffbeb'/><stop offset='1' stop-color='#f5e6cc'/></radialGradient></defs><rect width='${W}' height='${H}' fill='url(#g)'/><rect width='${W}' height='${H}' filter='url(#n)'/>`,
    ),
  },
  {
    id: 'night',
    name: '星空',
    dark: true,
    svg: wrap(
      `<defs><radialGradient id='g' cx='.7' cy='.1' r='1.1'><stop offset='0' stop-color='#1e3a8a'/><stop offset='.6' stop-color='#0f172a'/><stop offset='1' stop-color='#020617'/></radialGradient></defs><rect width='${W}' height='${H}' fill='url(#g)'/><g fill='#fff'>${Array.from(
        { length: 90 },
        (_, i) => {
          const r = ((i * 7) % 10) / 6 + 0.4;
          return `<circle cx='${(i * 337) % W}' cy='${(i * 211) % H}' r='${r.toFixed(2)}' opacity='${(0.35 + ((i * 13) % 60) / 100).toFixed(2)}'/>`;
        },
      ).join('')}</g>`,
    ),
  },
];

/** 内置背景的 CSS 图片地址（data URL，符合 CSP 的 img-src 'self' data:） */
export function presetImageUrl(id: string): string | null {
  const p = BACKGROUND_PRESETS.find((x) => x.id === id);
  return p ? `url("data:image/svg+xml,${encodeURIComponent(p.svg)}")` : null;
}

/** 校验背景设置；不合法时抛出说明 */
export function parseBackground(v: unknown): BackgroundSettings {
  const o = v as Partial<BackgroundSettings> | null;
  if (typeof o !== 'object' || o === null) throw new Error('背景设置取值不正确');
  const num = (x: unknown, min: number, max: number, name: string) => {
    if (typeof x !== 'number' || !Number.isFinite(x) || x < min || x > max) throw new Error(`${name}超出范围`);
    return Math.round(x * 100) / 100;
  };
  const image = o.image ?? null;
  if (image !== null) {
    const [kind, ref] = [image.slice(0, image.indexOf(':')), image.slice(image.indexOf(':') + 1)];
    const ok =
      typeof image === 'string' &&
      ((kind === 'preset' && BACKGROUND_PRESETS.some((p) => p.id === ref)) ||
        (kind === 'custom' && CUSTOM_BACKGROUND_FILE.test(ref)));
    if (!ok) throw new Error('背景图片取值不正确');
  }
  if (!BACKGROUND_POSITIONS.includes(o.position as BackgroundPosition)) throw new Error('背景位置取值不正确');
  return {
    image,
    blur: Math.round(num(o.blur, 0, 40, '模糊')),
    dim: num(o.dim, 0, 0.7, '暗化'),
    panel: num(o.panel, 0.4, 1, '面板不透明度'),
    position: o.position as BackgroundPosition,
  };
}
