import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { compareVersions, describeUpdateError, parseReleaseNotes } from '../../src/main/domain/release';
import { UpdateService, type RemoteVersion, type Updater, type UpdateOutput } from '../../src/main/services/update';
import { DEFAULT_SETTINGS, type Settings } from '../../src/shared/types';

describe('compareVersions', () => {
  it('语义化版本比较，预发布低于正式版', () => {
    expect(compareVersions('1.2.0', '1.10.0')).toBe(-1);
    expect(compareVersions('v1.0.1', '1.0.0')).toBe(1);
    expect(compareVersions('1.1.0-beta.2', '1.1.0')).toBe(-1);
    expect(compareVersions('1.1.0-beta.10', '1.1.0-beta.2')).toBe(1);
    expect(compareVersions('1.1.0', '1.1.0')).toBe(0);
  });
});

describe('parseReleaseNotes', () => {
  it('支持分组标题与行首前缀，HTML 会被去掉标签', () => {
    expect(parseReleaseNotes('### 新增\n- 统计页\n- 备份\n### 修复\n1. 排序错乱')).toEqual([
      { kind: 'new', text: '统计页' },
      { kind: 'new', text: '备份' },
      { kind: 'fix', text: '排序错乱' },
    ]);
    expect(parseReleaseNotes('<ul><li>改进：启动更快</li><li>其他说明 &amp; 致谢</li></ul>')).toEqual([
      { kind: 'imp', text: '启动更快' },
      { kind: null, text: '其他说明 & 致谢' },
    ]);
    expect(parseReleaseNotes(null)).toEqual([]);
  });
});

describe('describeUpdateError', () => {
  it('区分无网络、服务器不可用、安全连接与校验失败（FR-UPD-02 ②）', () => {
    expect(describeUpdateError(Object.assign(new Error('getaddrinfo'), { code: 'ENOTFOUND' }))).toMatch('无网络连接');
    expect(describeUpdateError(new Error('HttpError: 503 Service Unavailable'))).toMatch('服务器不可用');
    expect(describeUpdateError(new Error('CERT_HAS_EXPIRED'))).toMatch('安全连接');
    expect(describeUpdateError(new Error('sha512 checksum mismatch'))).toMatch('校验失败');
    expect(describeUpdateError(new Error('No published versions on GitHub'))).toMatch('还没有可用的安装包');
  });
});

describe('UpdateService', () => {
  let settings: Settings;
  const store = {
    get: () => settings,
    set: <K extends keyof Settings>(k: K, v: Settings[K]) => {
      settings = { ...settings, [k]: v };
    },
  };
  let remote: RemoteVersion | null;
  let checkError: Error | null;
  let updater: Updater & { checks: number; installed: number };
  let out: {
    status: Mock<UpdateOutput['status']>;
    notify: Mock<UpdateOutput['notify']>;
    backup: Mock<UpdateOutput['backup']>;
  };

  beforeEach(() => {
    settings = structuredClone(DEFAULT_SETTINGS);
    remote = { version: '1.1.0', releaseDate: '2026-11-03', notes: '新增：统计', size: 100 };
    checkError = null;
    updater = {
      checks: 0,
      installed: 0,
      canInstall: true,
      configure: vi.fn(),
      check: async () => {
        updater.checks++;
        if (checkError) throw checkError;
        return remote;
      },
      download: async (p) => p({ percent: 100, transferred: 100, total: 100 }),
      cancel: vi.fn(),
      install: () => void updater.installed++,
    };
    out = {
      status: vi.fn<UpdateOutput['status']>(),
      notify: vi.fn<UpdateOutput['notify']>(),
      backup: vi.fn<UpdateOutput['backup']>(),
    };
  });

  const make = (version = '1.0.0', u: Updater | null = updater) => new UpdateService(version, u, store, out);

  it('自动下载开启时：发现新版本 → 下载 → 就绪，只发一次"已就绪"通知', async () => {
    const svc = make();
    await svc.check(false);
    await vi.waitFor(() => expect(svc.status.phase).toBe('ready'));
    expect(svc.status).toMatchObject({ latest: '1.1.0', notes: [{ kind: 'new', text: '统计' }] });
    expect(out.notify).toHaveBeenCalledExactlyOnceWith('ready', '1.1.0');
    expect(settings.update.lastCheckAt).not.toBeNull();
    // 新进程（同一版本已通知过）不再通知
    const again = make();
    await again.check(false);
    await vi.waitFor(() => expect(again.status.phase).toBe('ready'));
    expect(out.notify).toHaveBeenCalledTimes(1);
  });

  it('关闭自动下载时只提示"可以更新了"；"稍后"后本次运行不再通知', async () => {
    settings.autoDownloadUpdate = false;
    const svc = make();
    svc.later();
    await svc.check(false);
    expect(svc.status.phase).toBe('available');
    expect(out.notify).not.toHaveBeenCalled();
    await svc.download();
    expect(svc.status.phase).toBe('ready');
  });

  it('跳过此版本后不再提示；发布更高版本后恢复（FR-UPD-03 AC①）', async () => {
    settings.autoDownloadUpdate = false;
    const svc = make();
    await svc.check(false);
    svc.skip();
    expect(settings.update.skipped).toBe('1.1.0');
    const next = make();
    await next.check(true);
    expect(next.status).toMatchObject({ phase: 'available', skipped: true }); // 手动检查仍显示
    expect(out.notify).toHaveBeenCalledTimes(1);
    remote = { ...remote!, version: '1.2.0' };
    const newer = make();
    await newer.check(false);
    expect(newer.status.skipped).toBe(false);
    expect(out.notify).toHaveBeenLastCalledWith('available', '1.2.0');
  });

  it('自动检查失败静默，手动检查显示原因（FR-UPD-01 AC②）', async () => {
    checkError = Object.assign(new Error('x'), { code: 'ENOTFOUND' });
    const svc = make();
    await svc.check(false);
    expect(svc.status.phase).toBe('idle');
    await svc.check(true);
    expect(svc.status).toMatchObject({ phase: 'error', error: '无网络连接，请检查网络后重试' });
  });

  it('只能手动下载的平台（未签名 macOS、deb）：只提示，不自动下载，下载请求被忽略', async () => {
    const manual = { ...updater, canInstall: false };
    const svc = make('1.0.0', manual);
    expect(svc.status.canInstall).toBe(false);
    await svc.check(false);
    expect(svc.status.phase).toBe('available');
    expect(out.notify).toHaveBeenCalledExactlyOnceWith('available', '1.1.0');
    await svc.download();
    expect(svc.status.phase).toBe('available');
  });

  it('已是最新版本；开发环境不支持更新', async () => {
    remote = null;
    const svc = make();
    expect((await svc.check(true)).phase).toBe('latest');
    const dev = make('1.0.0', null);
    expect(dev.status.supported).toBe(false);
    expect((await dev.check(true)).error).toMatch('开发版本');
  });

  it('关闭自动检查后不再发起检查（FR-UPD-01 AC①）', () => {
    vi.useFakeTimers();
    try {
      settings.autoCheckUpdate = false;
      const svc = make();
      svc.start();
      vi.advanceTimersByTime(3 * 24 * 3600_000);
      expect(updater.checks).toBe(0);
      svc.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('立即重启并更新前先做更新前备份，退出时不重复备份（FR-UPD-07）', async () => {
    const svc = make();
    await svc.check(false);
    await vi.waitFor(() => expect(svc.status.phase).toBe('ready'));
    svc.installNow();
    svc.beforeQuit();
    expect(out.backup).toHaveBeenCalledTimes(1);
    expect(updater.installed).toBe(1);
  });

  it('更新后首次启动显示横幅，关闭后不再显示（FR-UPD-11）', () => {
    settings.update = { ...settings.update, lastRunVersion: '1.0.0' };
    const svc = make('1.1.0');
    expect(svc.status.justUpdated).toBe('1.1.0');
    expect(make('1.1.0').status.justUpdated).toBe('1.1.0'); // 未关闭前保持
    svc.dismissBanner();
    expect(make('1.1.0').status.justUpdated).toBeNull();
    expect(make('1.0.0').status.justUpdated).toBeNull();
  });
});
