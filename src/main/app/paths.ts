import { app } from 'electron';
import { join } from 'node:path';

export const isDev = !app.isPackaged;

/** 托盘、应用图标等运行时资源：开发时在仓库 resources/，打包后在 resources/resources/ */
export function resourcePath(...p: string[]): string {
  return isDev ? join(app.getAppPath(), 'resources', ...p) : join(process.resourcesPath, 'resources', ...p);
}

/** 渲染页面地址：开发时用 Vite 开发服务器，打包后用本地文件 */
export function rendererEntry(page: 'main' | 'floating'): { url?: string; file?: string } {
  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (isDev && devUrl) return { url: `${devUrl}/${page}/index.html` };
  return { file: join(import.meta.dirname, `../renderer/${page}/index.html`) };
}

export function preloadPath(page: 'main' | 'floating'): string {
  return join(import.meta.dirname, `../preload/${page}.cjs`);
}
