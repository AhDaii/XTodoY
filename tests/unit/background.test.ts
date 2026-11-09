import { describe, expect, it } from 'vitest';
import { BACKGROUND_PRESETS, DEFAULT_BACKGROUND, parseBackground, presetImageUrl } from '../../src/shared/background';

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
