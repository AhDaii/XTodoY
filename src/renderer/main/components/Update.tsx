import { useEffect, useState } from 'react';
import type { Settings } from '@shared/types';
import type { UpdateStatus } from '@shared/update';
import { api, call } from '../lib/api';
import { useReportError } from '../lib/data';
import { useUi } from '../lib/store';
import { Icon, Logo, type IconName } from './Icon';
import { Dialog } from './Overlay';
import { Select } from './Select';

/** 更新界面（SRS F10，设计系统 §7.8，原型 UI-17） */

const RELEASES = 'https://github.com/AhDaii/XTodoY/releases';
const mb = (bytes?: number) => (bytes ? (bytes / 1024 / 1024).toFixed(1) : '—');
const day = (iso?: string) => (iso ? iso.slice(0, 10) : '');
const ago = (t: number | null) => {
  if (!t) return '从未';
  const d = new Date(t);
  const sameDay = d.toDateString() === new Date().toDateString();
  return `${sameDay ? '今天' : `${d.getMonth() + 1}月${d.getDate()}日`} ${d.toTimeString().slice(0, 5)}`;
};

function Switch(p: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange(v: boolean): void;
}) {
  return (
    <div className={`setting ${p.disabled ? 'is-disabled' : ''}`}>
      <div className="txt">
        <b id={`l-${p.id}`}>{p.label}</b>
        <span>{p.hint}</span>
      </div>
      <button
        className="switch"
        role="switch"
        aria-checked={p.checked}
        aria-labelledby={`l-${p.id}`}
        disabled={p.disabled}
        onClick={() => p.onChange(!p.checked)}
      />
    </div>
  );
}

/** 设置 › 更新：状态行（6 种状态）+ 选项（FR-UPD-02/08） */
export function UpdateSection({ status: u, settings }: { status: UpdateStatus; settings: Settings }) {
  const report = useReportError();
  const openDialog = useUi((s) => s.setUpdateDialog);
  const run = (p: Promise<unknown>) => void p.catch(report);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => run(call(api.settings.set(k, v)));

  let ic: IconName | null = 'checkCircle';
  let tone = '';
  let title: string;
  let sub: string;
  let acts: React.ReactNode = null;
  let progress = false;
  const checkBtn = (label = '检查更新') => (
    <button className="btn" onClick={() => run(call(api.update.check()))}>
      <Icon name="restore" size={14} />
      {label}
    </button>
  );
  switch (u.phase) {
    case 'checking':
      ic = null;
      title = '正在检查更新…';
      sub = '正在连接 GitHub Releases';
      break;
    case 'available':
      ic = 'download';
      tone = 'info';
      title = `发现新版本 ${u.latest}`;
      sub = `${day(u.releaseDate)} 发布 · ${mb(u.size)} MB${u.skipped ? ' · 已跳过此版本' : ''}${
        u.canInstall ? '' : ' · 此平台需要到发布页下载安装'
      }`;
      acts = (
        <>
          <button className="btn" onClick={() => openDialog(true)}>
            查看更新内容
          </button>
          {u.canInstall ? (
            <button className="btn primary" onClick={() => run(call(api.update.download()))}>
              <Icon name="download" size={14} />
              立即更新
            </button>
          ) : (
            <DownloadPageButton version={u.latest} />
          )}
        </>
      );
      break;
    case 'downloading':
      ic = 'download';
      tone = 'info';
      title = `正在下载 ${u.latest}`;
      sub = `${u.progress ?? 0}% · ${mb(u.transferred)} / ${mb(u.size)} MB · 下载期间可以继续使用`;
      progress = true;
      acts = (
        <button className="btn" onClick={() => run(call(api.update.cancel()))}>
          取消下载
        </button>
      );
      break;
    case 'ready':
      tone = 'info';
      title = '更新已就绪';
      sub = `${u.latest} 已下载并通过校验。重启后生效；不重启的话，下次退出程序时会自动安装`;
      acts = (
        <>
          <button className="btn" onClick={() => openDialog(true)}>
            查看更新内容
          </button>
          <InstallButton />
        </>
      );
      break;
    case 'error':
      ic = 'alert';
      tone = 'err';
      title = '更新失败';
      sub = u.error ?? '无法连接更新服务器，请检查网络后重试';
      acts = (
        <>
          <button className="btn ghost" onClick={() => run(call(api.openExternal(RELEASES)))}>
            前往下载页
          </button>
          {u.supported && checkBtn('重试')}
        </>
      );
      break;
    default:
      tone = 'ok';
      title = u.phase === 'latest' ? '已是最新版本' : `XTodoY ${u.current}`;
      sub = `XTodoY ${u.current} · 上次检查：${ago(u.lastCheckAt)}`;
      if (!u.supported) {
        ic = 'info';
        tone = '';
        title = '开发版本';
        sub = `XTodoY ${u.current} · 开发环境不检查更新，请使用安装版`;
      }
      acts = u.supported ? checkBtn() : null;
  }

  return (
    <section id="settings-update">
      <h2>更新</h2>
      <div className="setting-card">
        <div className={`update-status ${tone}`} role="status" aria-live="polite">
          <span className="us-icon">
            {ic ? <Icon name={ic} size={20} /> : <span className="spinner" aria-hidden="true" />}
          </span>
          <div className="txt">
            <b>{title}</b>
            <span>{sub}</span>
            {progress && (
              <div
                className="progress"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={u.progress ?? 0}
                aria-label="下载进度"
              >
                <i style={{ width: `${u.progress ?? 0}%` }} />
              </div>
            )}
          </div>
          <div className="us-acts">{acts}</div>
        </div>
        <Switch
          id="autoCheck"
          label="自动检查更新"
          hint="启动后及每 24 小时检查一次；关闭后只在手动检查时联网"
          checked={settings.autoCheckUpdate}
          onChange={(v) => set('autoCheckUpdate', v)}
        />
        <Switch
          id="autoDownload"
          label="自动下载更新"
          hint={
            u.canInstall || !u.supported
              ? '在后台下载，完成后提示重启；不重启则在退出程序时安装'
              : '此平台的安装包需要到发布页手动下载安装'
          }
          checked={u.canInstall && settings.autoCheckUpdate && settings.autoDownloadUpdate}
          disabled={!settings.autoCheckUpdate || (u.supported && !u.canInstall)}
          onChange={(v) => set('autoDownloadUpdate', v)}
        />
        <div className="setting">
          <div className="txt">
            <b>更新通道</b>
            <span>测试版可提前体验新功能，可能不稳定；切回稳定版不会降级</span>
          </div>
          <Select<Settings['updateChannel']>
            ariaLabel="更新通道"
            width={160}
            value={settings.updateChannel}
            onChange={(v) => set('updateChannel', v)}
            options={[
              { value: 'stable', label: '稳定版' },
              { value: 'beta', label: '测试版', hint: '包含预发布版本' },
            ]}
          />
        </div>
      </div>
    </section>
  );
}

/** 立即重启并更新：先显示"正在安装"，再交给主进程（更新前备份 → 安装 → 重启） */
function InstallButton({ label = '立即重启并更新' }: { label?: string }) {
  const report = useReportError();
  const setInstalling = useUi((s) => s.setInstalling);
  return (
    <button
      className="btn primary"
      onClick={() => {
        setInstalling(true);
        void call(api.update.installNow()).catch((e: unknown) => {
          setInstalling(false);
          report(e);
        });
      }}
    >
      <Icon name="restore" size={14} />
      {label}
    </button>
  );
}

/** 更新详情（FR-UPD-03）；更新后首次启动时显示已安装版本的说明 */
export function UpdateDialog({ status: u }: { status: UpdateStatus }) {
  const report = useReportError();
  const close = useUi((s) => s.setUpdateDialog);
  const showToast = useUi((s) => s.showToast);
  const after = !u.latest && u.justUpdated !== null;
  const version = after ? u.current : u.latest;
  const ready = u.phase === 'ready';
  // 更新后查看本版本内容：本地没有保存说明时向发布源读取（#25）
  const [loading, setLoading] = useState(after && !u.notes?.length);
  useEffect(() => {
    if (!after || u.notes?.length) return;
    void call(api.update.loadNotes())
      .catch(() => undefined)
      .finally(() => setLoading(false));
    // 只在打开时读取一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const act = (p: Promise<unknown>, msg?: string) => {
    close(false);
    void p.then(() => msg && showToast(msg)).catch(report);
  };
  return (
    <Dialog onClose={() => close(false)} label={`XTodoY ${version} 更新内容`} className="update-dialog">
      <>
        <div className="ud-head">
          <Logo size={40} />
          <div>
            <h2>XTodoY {version}</h2>
            <p className="help">
              {after ? '已安装' : `当前版本 ${u.current} · ${day(u.releaseDate)} 发布 · ${mb(u.size)} MB`}
            </p>
          </div>
        </div>
        <h3>更新内容</h3>
        {loading ? (
          <p className="help">正在获取更新内容…</p>
        ) : u.notes?.length ? (
          <ul className="release-notes">
            {u.notes.map((n, i) => (
              <li key={i}>
                {n.kind && (
                  <span className={`rn-tag rn-${n.kind}`}>{{ new: '新增', imp: '改进', fix: '修复' }[n.kind]}</span>
                )}
                <span>{n.text}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="help">
            详细说明见{' '}
            <a
              href={RELEASES}
              onClick={(e) => {
                e.preventDefault();
                void call(api.openExternal(RELEASES)).catch(report);
              }}
            >
              发布页
            </a>
            。
          </p>
        )}
        {!after && (
          <p className="help">
            {ready ? '安装包已通过 SHA-512 校验。' : ''}更新前会自动备份数据，重启期间错过的提醒会在启动后补发。
          </p>
        )}
        <div className="actions">
          {after ? (
            <button className="btn primary" onClick={() => close(false)}>
              知道了
            </button>
          ) : (
            <>
              {!u.skipped && (
                <button
                  className="btn ghost ud-skip"
                  onClick={() => act(call(api.update.skip()), `已跳过 ${u.latest}，有更高版本时会再提示`)}
                >
                  跳过此版本
                </button>
              )}
              <button className="btn" onClick={() => act(call(api.update.later()), '可以随时在"设置 › 更新"中继续')}>
                稍后
              </button>
              {ready ? (
                <InstallButton />
              ) : !u.canInstall ? (
                <DownloadPageButton version={u.latest} onDone={() => close(false)} />
              ) : (
                <button
                  className="btn primary"
                  disabled={u.phase !== 'available'}
                  onClick={() => act(call(api.update.download()))}
                >
                  立即更新
                </button>
              )}
            </>
          )}
        </div>
      </>
    </Dialog>
  );
}

/** 只能手动安装的平台：打开该版本的发布页 */
function DownloadPageButton({ version, onDone }: { version?: string; onDone?: () => void }) {
  const report = useReportError();
  return (
    <button
      className="btn primary"
      onClick={() => {
        onDone?.();
        void call(api.openExternal(version ? `${RELEASES}/tag/v${version}` : RELEASES)).catch(report);
      }}
    >
      <Icon name="download" size={14} />
      前往下载页
    </button>
  );
}

/** 更新后首次启动的横幅（FR-UPD-11） */
export function UpdatedBanner({ version }: { version: string }) {
  const report = useReportError();
  const open = useUi((s) => s.setUpdateDialog);
  return (
    <div className="banner info" role="status">
      <Icon name="checkCircle" />
      <span>已更新到 XTodoY {version}</span>
      <button className="btn sm ghost" onClick={() => open(true)}>
        查看更新内容
      </button>
      <span style={{ flex: 1 }} />
      <button
        className="icon-btn"
        aria-label="关闭提示"
        onClick={() => void call(api.update.dismissBanner()).catch(report)}
      >
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}

/** 正在安装（不可关闭）：主进程随后退出，安装完成后自动重新打开 */
export function InstallingOverlay({ version }: { version?: string }) {
  return (
    <div className="overlay">
      <div className="dialog installing" role="alertdialog" aria-label="正在更新">
        <Logo size={40} />
        <h2>正在安装 XTodoY {version}…</h2>
        <p className="help">已完成更新前备份，安装完成后会自动重新打开。</p>
        <div className="progress indeterminate">
          <i />
        </div>
      </div>
    </div>
  );
}
