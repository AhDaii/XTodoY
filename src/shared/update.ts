// 更新状态（SRS F10，IPC §2.5，原型 UI-17）

export type UpdatePhase = 'idle' | 'checking' | 'latest' | 'available' | 'downloading' | 'ready' | 'error';

export interface ReleaseNote {
  kind: 'new' | 'imp' | 'fix' | null;
  text: string;
}

export interface UpdateStatus {
  phase: UpdatePhase;
  /** 当前运行的版本 */
  current: string;
  /** 开发环境等无法更新时为 false，界面只显示说明 */
  supported: boolean;
  /**
   * 能否在程序内下载并安装：Windows、Linux AppImage 可以；未签名的 macOS 与 deb 安装只做检查，
   * 发现新版本后引导到下载页手动安装
   */
  canInstall: boolean;
  latest?: string;
  releaseDate?: string;
  notes?: ReleaseNote[];
  /** 安装包大小（字节） */
  size?: number;
  /** 下载进度 0–100 与已下载字节 */
  progress?: number;
  transferred?: number;
  lastCheckAt: number | null;
  error?: string;
  /** latest 是用户跳过的版本（不再提示，但手动检查时仍显示） */
  skipped: boolean;
  /** 更新后首次启动：显示"已更新到 vX.Y.Z"横幅（FR-UPD-11），关闭后为 null */
  justUpdated: string | null;
}

/** 侧边栏圆点、托盘提示：有可用版本或更新就绪，且没有被跳过 */
export const updateNeedsAttention = (s: UpdateStatus): boolean =>
  (s.phase === 'available' || s.phase === 'downloading' || s.phase === 'ready') && !s.skipped;
