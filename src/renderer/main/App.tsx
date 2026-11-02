import { useEffect, useState, type FormEvent } from 'react';
import type { AppInfo, ThemeSetting, TodayCount } from '@shared/ipc';

/**
 * P3 脚手架页面：验证 IPC、主题、设计令牌与 Tailwind 接入。
 * P4 起替换为正式界面（design/prototype/index.html）。
 */
export function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [today, setToday] = useState<TodayCount>({ open: 0, done: 0, total: 0 });
  const [title, setTitle] = useState('');
  const [theme, setTheme] = useState<ThemeSetting>('system');

  useEffect(() => {
    void window.xtodoy.appInfo().then(setInfo);
    void window.xtodoy.getToday().then(setToday);
    return window.xtodoy.onTodayCount(setToday);
  }, []);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await window.xtodoy.spikeAddTodo(title);
    setTitle('');
  };

  const changeTheme = (t: ThemeSetting) => {
    setTheme(t);
    void window.xtodoy.setTheme(t).then(({ dark }) => document.documentElement.classList.toggle('dark', dark));
  };

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="titlebar flex h-10 items-center gap-2 border-b border-border bg-surface-sunken px-4 font-semibold">
        <span className="grid size-5 place-items-center rounded-md bg-primary text-xs text-primary-foreground">✓</span>
        XTodoY
        <span className="ml-2 text-xs font-normal text-foreground-subtle">P3 脚手架</span>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 overflow-y-auto p-6">
        <section className="rounded-lg border border-border bg-surface p-5">
          <div className="text-sm text-foreground-muted">今日待办（仅今天到期）</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-4xl font-bold text-primary tabular-nums">{today.open}</span>
            <span className="text-sm text-foreground-muted">
              未完成 · 已完成 {today.done} / 共 {today.total}
            </span>
          </div>
          <form onSubmit={add} className="mt-4 flex gap-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="添加一条今天的待办，回车保存"
              aria-label="待办标题"
              className="h-10 flex-1 rounded-md border border-border bg-surface-sunken px-3 outline-none focus:border-primary"
            />
            <button className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover">
              添加
            </button>
          </form>
          <p className="mt-2 text-xs text-foreground-subtle">添加后悬浮窗与托盘提示会同步更新。</p>
        </section>

        <section className="rounded-lg border border-border bg-surface p-5">
          <div className="mb-3 text-sm font-semibold">技术验证</div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void window.xtodoy.spikeNotify()}
              className="h-8 rounded-md border border-border-strong px-3 text-sm hover:bg-surface-hover"
            >
              发送测试通知（带「完成」「稍后提醒」）
            </button>
            <div
              className="ml-auto flex rounded-md border border-border bg-surface-sunken p-0.5"
              role="group"
              aria-label="主题"
            >
              {(['light', 'dark', 'system'] as const).map((t) => (
                <button
                  key={t}
                  aria-pressed={theme === t}
                  onClick={() => changeTheme(t)}
                  className="h-7 rounded px-3 text-sm text-foreground-muted aria-pressed:bg-surface aria-pressed:text-foreground aria-pressed:shadow-sm"
                >
                  {{ light: '浅色', dark: '深色', system: '跟随系统' }[t]}
                </button>
              ))}
            </div>
          </div>
        </section>

        {info && (
          <section className="rounded-lg border border-border bg-surface p-5 text-sm">
            <div className="mb-2 font-semibold">运行环境</div>
            <dl className="grid grid-cols-[120px_1fr] gap-y-1 text-foreground-muted">
              <dt>版本</dt>
              <dd className="text-foreground">{info.version}</dd>
              <dt>Electron</dt>
              <dd className="text-foreground">{info.electron}</dd>
              <dt>Chromium / Node</dt>
              <dd className="text-foreground">
                {info.chrome} / {info.node}
              </dd>
              <dt>数据库版本</dt>
              <dd className="text-foreground">{info.dbSchemaVersion}</dd>
              <dt>数据目录</dt>
              <dd className="break-all text-foreground">{info.dataDir}</dd>
            </dl>
          </section>
        )}
      </main>
    </div>
  );
}
