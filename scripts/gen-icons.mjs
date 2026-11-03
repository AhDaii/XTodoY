// 生成应用图标与托盘图标（纯 Node，无第三方依赖）：圆角方块 + 对勾。
// 输出：build/icon.png（512，electron-builder 据此生成 .ico）、resources/icon.png（256）、
//      resources/tray-light.png / tray-dark.png（32，分别用于浅色 / 深色任务栏）、
//      resources/trayTemplate.png / trayTemplate@2x.png（16 / 32，macOS 菜单栏模板图标：纯黑 + 透明度，由系统着色）
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BLUE = [37, 99, 235]; // --primary #2563eb
const WHITE = [255, 255, 255];
const SLATE = [15, 23, 42]; // --foreground #0f172a
const LIGHT = [226, 232, 240]; // 深色 --foreground #e2e8f0
const BLACK = [0, 0, 0];

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const distSeg = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax,
    dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
};
const inRoundRect = (x, y, r) => {
  // 单位坐标 [0,1]，圆角半径 r
  const cx = Math.min(Math.max(x, r), 1 - r),
    cy = Math.min(Math.max(y, r), 1 - r);
  return Math.hypot(x - cx, y - cy) <= r;
};

/**
 * mode = 'app'：蓝底白勾；mode = 'tray'：单色剪影（方框描边 + 对勾），color 为剪影颜色
 */
function draw(size, mode, color) {
  const SS = 4;
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bg = 0,
        fg = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x + (sx + 0.5) / SS) / size,
            v = (y + (sy + 0.5) / SS) / size;
          const inset = mode === 'app' ? 0.04 : 0.06;
          const uu = (u - inset) / (1 - 2 * inset),
            vv = (v - inset) / (1 - 2 * inset);
          const inside = uu >= 0 && uu <= 1 && vv >= 0 && vv <= 1 && inRoundRect(uu, vv, 0.26);
          const check =
            distSeg(uu, vv, 0.27, 0.53, 0.43, 0.69) < 0.075 || distSeg(uu, vv, 0.43, 0.69, 0.74, 0.34) < 0.075;
          if (mode === 'app') {
            if (inside && check) fg++;
            else if (inside) bg++;
          } else {
            const ring =
              inside &&
              !(uu > 0.1 && uu < 0.9 && vv > 0.1 && vv < 0.9 && inRoundRect((uu - 0.1) / 0.8, (vv - 0.1) / 0.8, 0.2));
            if (ring || (inside && check)) fg++;
          }
        }
      }
      const n = SS * SS,
        i = (y * size + x) * 4;
      const a = (bg + fg) / n;
      if (a === 0) continue;
      const fgColor = mode === 'app' ? WHITE : color;
      const mix = (c) => Math.round(mode === 'app' ? (BLUE[c] * bg + fgColor[c] * fg) / (bg + fg) : fgColor[c]);
      buf[i] = mix(0);
      buf[i + 1] = mix(1);
      buf[i + 2] = mix(2);
      buf[i + 3] = Math.round(a * 255);
    }
  }
  return png(size, buf);
}

mkdirSync('build', { recursive: true });
mkdirSync('resources', { recursive: true });
writeFileSync('build/icon.png', draw(512, 'app'));
writeFileSync('resources/icon.png', draw(256, 'app'));
writeFileSync('resources/tray-light.png', draw(32, 'tray', SLATE));
writeFileSync('resources/tray-dark.png', draw(32, 'tray', LIGHT));
writeFileSync('resources/trayTemplate.png', draw(16, 'tray', BLACK));
writeFileSync('resources/trayTemplate@2x.png', draw(32, 'tray', BLACK));
console.log('icons: build/icon.png, resources/icon.png, resources/tray-*.png, resources/trayTemplate*.png');
