import { app } from 'electron';
import type { RemoteVersion, Updater } from '../services/update';

type AppUpdater = import('electron-updater').AppUpdater;
type CancellationToken = import('electron-updater').CancellationToken;

/**
 * 安装版：electron-updater + GitHub Releases（D-13，docs/design/release.md §3）。
 * 第一次检查时才加载模块，不占用常驻内存。
 */
class ElectronUpdater implements Updater {
  private au: AppUpdater | null = null;
  private allowPrerelease = false;
  private token: CancellationToken | null = null;

  private async load(): Promise<AppUpdater> {
    if (this.au) return this.au;
    const mod = await import('electron-updater');
    const au = mod.default?.autoUpdater ?? mod.autoUpdater;
    au.autoDownload = false; // 下载由 UpdateService 按设置控制
    au.autoInstallOnAppQuit = true; // D-15：不重启则退出时静默安装
    au.allowDowngrade = false; // 切回稳定版不降级（FR-UPD-10）
    au.allowPrerelease = this.allowPrerelease;
    au.logger = console;
    this.au = au;
    return au;
  }

  configure(o: { allowPrerelease: boolean }): void {
    this.allowPrerelease = o.allowPrerelease;
    if (this.au) {
      this.au.allowPrerelease = o.allowPrerelease;
      this.au.allowDowngrade = false;
    }
  }

  async check(): Promise<RemoteVersion | null> {
    const au = await this.load();
    const r = await au.checkForUpdates();
    if (!r?.isUpdateAvailable) return null;
    const info = r.updateInfo;
    const notes = Array.isArray(info.releaseNotes)
      ? info.releaseNotes.map((n) => n.note ?? '').join('\n')
      : (info.releaseNotes ?? null);
    return { version: info.version, releaseDate: info.releaseDate, notes, size: info.files[0]?.size };
  }

  async download(onProgress: (p: { percent: number; transferred: number; total: number }) => void): Promise<void> {
    const au = await this.load();
    const { CancellationToken } = await import('electron-updater');
    this.token = new CancellationToken();
    const listener = (p: { percent: number; transferred: number; total: number }) => onProgress(p);
    au.on('download-progress', listener);
    try {
      await au.downloadUpdate(this.token);
    } finally {
      au.off('download-progress', listener);
      this.token = null;
    }
  }

  cancel(): void {
    this.token?.cancel();
  }

  install(): void {
    // isSilent：不显示安装界面；isForceRunAfter：安装后重新启动
    this.au?.quitAndInstall(true, true);
  }
}

/**
 * 开发 / 测试用的模拟更新器：XTODOY_FAKE_UPDATE=<版本号>[,fail-check|fail-download]。
 * 只在未打包时可用，便于在原型之外演示与端到端测试更新界面。
 */
class FakeUpdater implements Updater {
  private cancelled = false;
  constructor(
    private readonly version: string,
    private readonly fail: string | undefined,
  ) {}
  configure(): void {}
  async check(): Promise<RemoteVersion | null> {
    await delay(200);
    if (this.fail === 'fail-check')
      throw Object.assign(new Error('getaddrinfo ENOTFOUND github.com'), { code: 'ENOTFOUND' });
    return {
      version: this.version,
      releaseDate: new Date().toISOString(),
      notes: '### 新增\n- 统计页\n### 修复\n- 修复手动排序顺序错乱',
      size: 40 * 1024 * 1024,
    };
  }
  async download(onProgress: (p: { percent: number; transferred: number; total: number }) => void): Promise<void> {
    this.cancelled = false;
    const total = 40 * 1024 * 1024;
    for (let i = 1; i <= 10; i++) {
      await delay(150);
      if (this.cancelled) throw new Error('cancelled');
      if (this.fail === 'fail-download' && i === 5) throw new Error('sha512 checksum mismatch');
      onProgress({ percent: i * 10, transferred: (total * i) / 10, total });
    }
  }
  cancel(): void {
    this.cancelled = true;
  }
  install(): void {
    app.quit();
  }
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 安装版返回 electron-updater；开发环境除非指定模拟版本，否则不支持更新（返回 null） */
export function createUpdater(): Updater | null {
  const fake = process.env['XTODOY_FAKE_UPDATE'];
  if (!app.isPackaged) {
    if (!fake) return null;
    const [version, fail] = fake.split(',');
    return new FakeUpdater(version!, fail);
  }
  return new ElectronUpdater();
}
