import type { FloatingApi, XtodoyApi } from '../shared/ipc';

declare global {
  interface Window {
    /** 主窗口为 XtodoyApi，悬浮窗为 FloatingApi */
    xtodoy: XtodoyApi & FloatingApi;
  }
}

export {};
