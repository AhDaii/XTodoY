import { describe, expect, it } from 'vitest';
import {
  accentTokens,
  BACKGROUND_PRESETS,
  backgroundAccent,
  contrastRatio,
  DEFAULT_BACKGROUND,
  dominantAccent,
  parseBackground,
  presetImageUrl,
} from '../../src/shared/background';

describe('窗口背景图设置（#41）', () => {
  it('默认无背景；接受内置背景与上传图片的引用，参数四舍五入到百分位', () => {
    expect(parseBackground(DEFAULT_BACKGROUND)).toEqual(DEFAULT_BACKGROUND);
    expect(parseBackground({ ...DEFAULT_BACKGROUND, image: 'preset:hills', dim: 0.333 })).toMatchObject({
      image: 'preset:hills',
      dim: 0.33,
    });
    expect(parseBackground({ ...DEFAULT_BACKGROUND, image: 'custom:custom-1762675200000.jpg' }).image).toBe(
      'custom:custom-1762675200000.jpg',
    );
  });

  it('拒绝未知背景、可能越出数据目录的文件名与超范围参数', () => {
    for (const image of ['preset:unknown', 'custom:../../secret.jpg', 'custom:a.png', 'file:///c:/x.jpg', 'hills'])
      expect(() => parseBackground({ ...DEFAULT_BACKGROUND, image })).toThrow();
    expect(() => parseBackground({ ...DEFAULT_BACKGROUND, blur: 41 })).toThrow();
    expect(() => parseBackground({ ...DEFAULT_BACKGROUND, dim: 0.8 })).toThrow();
    expect(() => parseBackground({ ...DEFAULT_BACKGROUND, panel: 0.3 })).toThrow();
    expect(() => parseBackground({ ...DEFAULT_BACKGROUND, position: 'left' })).toThrow();
    expect(() => parseBackground(null)).toThrow();
  });

  it('6 个内置背景都生成合法的 SVG data URL', () => {
    expect(BACKGROUND_PRESETS).toHaveLength(6);
    for (const p of BACKGROUND_PRESETS) {
      const url = presetImageUrl(p.id)!;
      expect(url.startsWith('url("data:image/svg+xml,')).toBe(true);
      expect(decodeURIComponent(url.slice(24, -2))).toMatch(/^<svg xmlns='http:\/\/www.w3.org\/2000\/svg'.*<\/svg>$/s);
    }
    expect(presetImageUrl('nope')).toBeNull();
  });
});

describe('背景主色（#47）', () => {
  it('每个内置背景都有主色；按主题调整后与白字 / 深色底对比度 ≥ 4.5', () => {
    for (const p of BACKGROUND_PRESETS) {
      expect(p.accent).toMatch(/^#[0-9a-f]{6}$/);
      expect(contrastRatio(accentTokens(p.accent, false).primary, '#ffffff')).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(accentTokens(p.accent, true).primary, '#0a1020')).toBeGreaterThanOrEqual(4.5);
    }
    // 已满足对比度的颜色不改动
    expect(accentTokens('#2563eb', false).primary).toBe('#2563eb');
  });

  it('从像素中取饱和度高、数量多的颜色；黑白图片没有主色', () => {
    const px = (colors: [number, number, number, number][]) =>
      new Uint8Array(colors.flatMap(([r, g, b, n]) => Array.from({ length: n }, () => [r, g, b, 255]).flat()));
    // 大片灰白中有一块橙色：取橙色
    expect(
      dominantAccent(
        px([
          [240, 240, 240, 80],
          [234, 88, 12, 20],
        ]),
      ),
    ).toBe('#ea580c');
    // BGRA 顺序（Electron nativeImage.toBitmap）
    expect(dominantAccent(px([[12, 88, 234, 20]]), 'bgra')).toBe('#ea580c');
    expect(
      dominantAccent(
        px([
          [128, 128, 128, 100],
          [30, 30, 30, 50],
        ]),
      ),
    ).toBeNull();
  });

  it('当前背景的主色：内置用预设，上传用提取的颜色，无背景为 null', () => {
    expect(backgroundAccent({ ...DEFAULT_BACKGROUND, image: 'preset:sand' })).toBe('#b45309');
    expect(
      backgroundAccent({ ...DEFAULT_BACKGROUND, image: 'custom:custom-1762675200000.jpg', accent: '#123456' }),
    ).toBe('#123456');
    expect(backgroundAccent(DEFAULT_BACKGROUND)).toBeNull();
    expect(() => parseBackground({ ...DEFAULT_BACKGROUND, accent: 'red' })).toThrow();
    // 旧版本保存的设置没有 accent 字段
    const old: Partial<typeof DEFAULT_BACKGROUND> = { ...DEFAULT_BACKGROUND };
    delete old.accent;
    expect(parseBackground(old).accent).toBeNull();
  });
});
