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

/**
 * Windows 的 AppUserModelID：任务栏按钮按它匹配"开始"菜单中的快捷方式并使用快捷方式的图标（#23）。
 * 开发版使用不同的 ID，避免开发时系统自动生成的、指向 electron.exe 的快捷方式与安装版冲突，
 * 导致安装版的任务栏图标显示成 Electron 的图标。
 */
export const APP_USER_MODEL_ID = isDev ? 'com.xtodoy.app.dev' : 'com.xtodoy.app';
