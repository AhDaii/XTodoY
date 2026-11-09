import { dialog, nativeImage, type BrowserWindow } from 'electron';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CUSTOM_BACKGROUND_FILE } from '@shared/background';
import { AppError } from '../services/errors';

/** 保存时的最长边：足够铺满 2K 屏，同时控制解码后的内存（2560×1600 约 16 MB） */
const MAX_SIDE = 2560;
const MAX_INPUT_BYTES = 30 * 1024 * 1024;

/**
 * 选择背景图（#41）：缩放到最长边不超过 2560 px，以 JPEG 保存到 <数据目录>/backgrounds/，
 * 并删除之前上传的图片。返回设置中使用的 'custom:<文件名>'；取消时返回 null。
 */
export async function chooseBackground(owner: BrowserWindow | undefined, dir: string): Promise<string | null> {
  const opts = {
    title: '选择背景图片',
    properties: ['openFile' as const],
    filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
  };
  const r = owner ? await dialog.showOpenDialog(owner, opts) : await dialog.showOpenDialog(opts);
  const file = r.filePaths[0];
  if (r.canceled || !file) return null;
  if ((await stat(file)).size > MAX_INPUT_BYTES) throw new AppError('INVALID', '图片过大（超过 30 MB）');
  let img = nativeImage.createFromBuffer(await readFile(file));
  if (img.isEmpty()) throw new AppError('INVALID', '无法读取这张图片，请换一张 JPG、PNG 或 WebP 图片');
  const { width, height } = img.getSize();
  if (Math.max(width, height) > MAX_SIDE) {
    img = img.resize(width >= height ? { width: MAX_SIDE, quality: 'best' } : { height: MAX_SIDE, quality: 'best' });
  }
  await mkdir(dir, { recursive: true });
  const name = `custom-${Date.now()}.jpg`;
  await writeFile(join(dir, name), img.toJPEG(88));
  for (const f of await readdir(dir)) if (f !== name) await rm(join(dir, f), { force: true });
  return `custom:${name}`;
}

/** 读取上传的背景图，返回 data URL（主窗口 CSP 只允许 'self' 与 data: 图片）；文件不存在时返回 null */
export async function loadBackground(dir: string, name: string): Promise<string | null> {
  if (!CUSTOM_BACKGROUND_FILE.test(name)) throw new AppError('INVALID', '背景图片名称不正确');
  try {
    return `data:image/jpeg;base64,${(await readFile(join(dir, name))).toString('base64')}`;
  } catch {
    return null;
  }
}
