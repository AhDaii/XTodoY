import type { Settings } from '@shared/types';
import type { UpdatePhase, UpdateStatus } from '@shared/update';
import { compareVersions, describeUpdateError, parseReleaseNotes } from '../domain/release';
import { bus } from '../events/bus';

/** 发布源上的新版本信息（与 electron-updater 的 UpdateInfo 对应的最小子集） */
export interface RemoteVersion {
  version: string;
  releaseDate: string;
  notes: string | null;
  size?: number;
}

/** 更新器：安装版为 electron-updater，开发 / 测试环境为模拟实现（platform/updater.ts） */
export interface Updater {
  /** 能否在程序内下载安装（见 UpdateStatus.canInstall） */
  readonly canInstall: boolean;
  configure(o: { allowPrerelease: boolean }): void;
  /** 返回发布源上的最新版本；没有更高版本时返回 null */
  check(): Promise<RemoteVersion | null>;
  /** 下载并校验 SHA-512；取消时以 cancelled 错误结束 */
  download(onProgress: (p: { percent: number; transferred: number; total: number }) => void): Promise<void>;
  cancel(): void;
  /** 立即退出、安装并重新启动 */
  install(): void;
}

export interface UpdateOutput {
  status(s: UpdateStatus): void;
  notify(kind: 'available' | 'ready', version: string): void;
  /** 安装前备份（FR-UPD-07） */
  backup(): void;
}

const DAY = 24 * 3600_000;
const FIRST_CHECK_DELAY = 60_000;

type Persisted = Settings['update'];

/**
 * 更新服务（SRS F10，D-13~D-15）：单定时器调度检查；发现新版本后低打扰提示；
 * 下载完成后提示重启，不重启则由 electron-updater 在退出时静默安装。
 */
export class UpdateService {
  private s: UpdateStatus;
  private timer: NodeJS.Timeout | null = null;
  /** "稍后"：本次运行不再发通知（FR-UPD-03 ②） */
  private quietThisRun = false;
  private backedUp = false;

  constructor(
    private readonly current: string,
    private readonly updater: Updater | null,
    private readonly settings: { get(): Settings; set<K extends keyof Settings>(k: K, v: Settings[K]): unknown },
    private readonly out: UpdateOutput,
    private readonly now: () => number = () => Date.now(),
  ) {
    const p = settings.get().update;
    // 更新后首次启动：记录横幅（FR-UPD-11）
    const updatedFrom = p.lastRunVersion && compareVersions(current, p.lastRunVersion) > 0;
    const justUpdated = updatedFrom ? current : p.banner;
    this.persist({ lastRunVersion: current, banner: justUpdated });
    this.s = {
      phase: 'idle',
      current,
      supported: updater !== null,
      canInstall: updater?.canInstall ?? false,
      lastCheckAt: p.lastCheckAt,
      skipped: false,
      justUpdated,
    };
  }

  /** 异步操作之后读取最新阶段（可能已被 cancel 等改变） */
  private phase(): UpdatePhase {
    return this.s.phase;
  }

  get status(): UpdateStatus {
    return { ...this.s };
  }

  start(): void {
    if (!this.updater) return;
    this.updater.configure({ allowPrerelease: this.settings.get().updateChannel === 'beta' });
    bus.on('settings.changed', (patch) => {
      if (patch.updateChannel !== undefined)
        this.updater?.configure({ allowPrerelease: patch.updateChannel === 'beta' });
      if (patch.autoCheckUpdate !== undefined) this.arm(FIRST_CHECK_DELAY);
    });
    // 休眠唤醒后距上次检查超过 24 小时则补做一次（FR-UPD-01）
    bus.on('time.jumped', (reason) => {
      if (reason === 'resume' && this.due()) this.arm(5_000);
    });
    this.arm(FIRST_CHECK_DELAY);
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private due(): boolean {
    return this.s.lastCheckAt === null || this.now() - this.s.lastCheckAt >= DAY;
  }

  /** 单定时器：关闭自动检查时不再发起任何网络请求（FR-UPD-01 AC①） */
  private arm(delay: number): void {
    this.stop();
    if (!this.updater || !this.settings.get().autoCheckUpdate) return;
    this.timer = setTimeout(() => {
      void this.check(false).finally(() => this.arm(DAY));
    }, delay);
    this.timer.unref?.();
  }

  private set(patch: Partial<UpdateStatus>): void {
    this.s = { ...this.s, ...patch };
    this.out.status(this.status);
  }

  private persist(patch: Partial<Persisted>): void {
    this.settings.set('update', { ...this.settings.get().update, ...patch });
  }

  /** 检查更新；手动检查显示失败原因，自动检查静默失败（FR-UPD-01 AC②） */
  async check(manual = true): Promise<UpdateStatus> {
    if (!this.updater) {
      if (manual) this.set({ phase: 'error', error: '开发版本不检查更新，请使用安装版' });
      return this.status;
    }
    if (this.s.phase === 'checking' || this.s.phase === 'downloading') return this.status;
    if (this.s.phase === 'ready') return this.status; // 已下载待安装，无需再检查
    const before = this.s.phase;
    this.set({ phase: 'checking', error: undefined });
    let remote: RemoteVersion | null;
    try {
      remote = await this.updater.check();
    } catch (e) {
      console.error('[update] check failed', e);
      if (manual) this.set({ phase: 'error', error: describeUpdateError(e) });
      else this.set({ phase: before === 'error' ? 'idle' : before });
      return this.status;
    }
    const lastCheckAt = this.now();
    this.persist({ lastCheckAt });
    if (!remote || compareVersions(remote.version, this.current) <= 0) {
      this.set({ phase: 'latest', lastCheckAt, latest: undefined, skipped: false });
      return this.status;
    }
    const skipped = this.settings.get().update.skipped === remote.version;
    this.set({
      phase: 'available',
      lastCheckAt,
      latest: remote.version,
      releaseDate: remote.releaseDate,
      notes: parseReleaseNotes(remote.notes),
      size: remote.size,
      skipped,
    });
    if (skipped) return this.status;
    const { autoCheckUpdate, autoDownloadUpdate } = this.settings.get();
    if (this.updater.canInstall && autoCheckUpdate && autoDownloadUpdate) void this.download();
    else this.notifyOnce('available');
    return this.status;
  }

  /** 下载（FR-UPD-04）；完成并校验后进入"就绪" */
  async download(): Promise<void> {
    if (!this.updater?.canInstall || this.s.phase !== 'available') return;
    this.set({ phase: 'downloading', progress: 0, transferred: 0, error: undefined });
    try {
      await this.updater.download((p) =>
        this.set({ progress: Math.floor(p.percent), transferred: p.transferred, size: p.total || this.s.size }),
      );
    } catch (e) {
      if (this.phase() !== 'downloading') return; // 下载期间被取消
      console.error('[update] download failed', e);
      this.set({ phase: 'error', error: describeUpdateError(e), progress: undefined });
      return;
    }
    this.set({ phase: 'ready', progress: 100 });
    this.notifyOnce('ready');
  }

  cancel(): void {
    if (this.s.phase !== 'downloading') return;
    this.set({ phase: 'available', progress: undefined, transferred: undefined });
    this.updater?.cancel();
  }

  /** 跳过此版本：不再提示，发布更高版本后恢复（FR-UPD-03 AC①） */
  skip(): void {
    if (!this.s.latest) return;
    this.cancel();
    this.persist({ skipped: this.s.latest });
    this.set({ skipped: true });
  }

  later(): void {
    this.quietThisRun = true;
  }

  dismissBanner(): void {
    this.persist({ banner: null });
    this.set({ justUpdated: null });
  }

  /** 立即重启并更新（FR-UPD-06）：先做更新前备份，再交给安装程序 */
  installNow(): void {
    if (!this.updater || this.s.phase !== 'ready') return;
    this.beforeQuit();
    this.updater.install();
  }

  /** 退出时：若有已下载的更新，安装程序会在退出后运行，先做更新前备份（FR-UPD-07） */
  beforeQuit(): void {
    if (this.s.phase !== 'ready' || this.backedUp) return;
    this.backedUp = true;
    try {
      this.out.backup();
    } catch (e) {
      console.error('[update] pre-update backup failed', e);
    }
  }

  /** 每个版本最多发一次系统通知（FR-UPD-03） */
  private notifyOnce(kind: 'available' | 'ready'): void {
    const version = this.s.latest;
    if (!version || this.quietThisRun) return;
    const key = kind === 'available' ? 'notifiedAvailable' : 'notifiedReady';
    if (this.settings.get().update[key] === version) return;
    this.persist({ [key]: version });
    this.out.notify(kind, version);
  }
}
