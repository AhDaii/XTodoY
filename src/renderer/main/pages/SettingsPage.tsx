import { useEffect, useState } from 'react';
import type { AppInfo } from '@shared/ipc';
import type { Settings } from '@shared/types';
import { Icon, type IconName } from '../components/Icon';
import { Select } from '../components/Select';
import { api, call } from '../lib/api';
import { useReportError } from '../lib/data';

/** 设置页（UI-10）：P4 提供通用、外观、悬浮窗与关于；提醒、数据、更新在 P5 / P6 补齐 */
function Switch(p: { id: string; label: string; hint: string; checked: boolean; onChange(v: boolean): void }) {
  return (
    <div className="setting">
      <div className="txt">
        <b id={`l-${p.id}`}>{p.label}</b>
        <span>{p.hint}</span>
      </div>
      <button
        className="switch"
        role="switch"
        aria-checked={p.checked}
        aria-labelledby={`l-${p.id}`}
        onClick={() => p.onChange(!p.checked)}
      />
    </div>
  );
}

export function SettingsPage({ settings }: { settings: Settings }) {
  const report = useReportError();
  const [info, setInfo] = useState<AppInfo | null>(null);
  useEffect(() => void call(api.appInfo()).then(setInfo).catch(report), [report]);
  // 每 30 秒刷新一次，暂停到期后自动显示为未暂停
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const paused = settings.pausedUntil !== null && settings.pausedUntil > now;
  const pausedLabel = paused ? new Date(settings.pausedUntil!).toTimeString().slice(0, 5) : '';
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    void call(api.settings.set(key, value)).catch(report);

  const themes: [Settings['theme'], IconName, string][] = [
    ['light', 'sun', '浅色'],
    ['dark', 'moon', '深色'],
    ['system', 'laptop', '跟随系统'],
  ];

  return (
    <main className="main" aria-label="设置">
      <header className="main-header">
        <div>
          <h1>设置</h1>
          <div className="sub">修改即时生效</div>
        </div>
      </header>
      <div className="main-scroll settings">
        <section>
          <h2>通用</h2>
          <div className="setting-card">
            <Switch
              id="autostart"
              label="开机自启"
              hint="登录系统后在后台启动，只显示托盘与悬浮窗"
              checked={settings.autostart}
              onChange={(v) => set('autostart', v)}
            />
            <div className="setting">
              <div className="txt">
                <b>关闭主窗口时</b>
                <span>选择"最小化到托盘"可继续接收提醒</span>
              </div>
              <Select
                ariaLabel="关闭主窗口时"
                width={160}
                value={settings.closeAction}
                onChange={(v) => set('closeAction', v)}
                options={[
                  { value: 'tray', label: '最小化到托盘', hint: '继续在后台提醒' },
                  { value: 'quit', label: '退出程序', hint: '不再接收提醒' },
                ]}
              />
            </div>
            <div className="setting">
              <div className="txt">
                <b>每周起始日</b>
                <span>影响日期选择器、"本周"分组与周统计</span>
              </div>
              <Select
                ariaLabel="每周起始日"
                width={160}
                value={settings.weekStart}
                onChange={(v) => set('weekStart', v)}
                options={[
                  { value: 1 as const, label: '周一' },
                  { value: 0 as const, label: '周日' },
                ]}
              />
            </div>
          </div>
        </section>

        <section>
          <h2>外观</h2>
          <div className="setting-card">
            <div className="setting">
              <div className="txt">
                <b>主题</b>
                <span>跟随系统时会随 Windows 的浅色 / 深色设置自动切换</span>
              </div>
              <div className="seg" role="group" aria-label="主题">
                {themes.map(([v, ic, label]) => (
                  <button key={v} aria-pressed={settings.theme === v} onClick={() => set('theme', v)}>
                    <Icon name={ic} size={14} />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section>
          <h2>悬浮窗</h2>
          <div className="setting-card">
            <div className="setting">
              <div className="txt">
                <b id="l-floating">显示悬浮窗</b>
                <span>桌面置顶显示今日未完成数量，单击打开主窗口</span>
              </div>
              <button
                className="switch"
                role="switch"
                aria-checked={settings.floatingEnabled}
                aria-labelledby="l-floating"
                onClick={() => set('floatingEnabled', !settings.floatingEnabled)}
              />
            </div>
            <div className="setting">
              <div className="txt">
                <b>透明度</b>
                <span>降低透明度可以减少对桌面的遮挡</span>
              </div>
              <Select<100 | 80 | 60>
                ariaLabel="悬浮窗透明度"
                width={160}
                value={settings.floatingOpacity}
                onChange={(v) => set('floatingOpacity', v)}
                options={[
                  { value: 100, label: '100%' },
                  { value: 80, label: '80%' },
                  { value: 60, label: '60%' },
                ]}
              />
            </div>
            <Switch
              id="floating-lock"
              label="锁定位置"
              hint="锁定后无法拖动悬浮窗"
              checked={settings.floatingLocked}
              onChange={(v) => set('floatingLocked', v)}
            />
            <div className="setting">
              <div className="txt">
                <b>重置位置</b>
                <span>移回主显示器右下角（重新显示悬浮窗后生效）</span>
              </div>
              <button className="btn" onClick={() => set('floatingPos', null)}>
                重置
              </button>
            </div>
          </div>
        </section>

        <section>
          <h2>提醒</h2>
          <div className="setting-card">
            <div className="setting">
              <div className="txt">
                <b>暂停提醒</b>
                <span>暂停期间的提醒会在恢复后补发；也可以在托盘菜单中操作</span>
              </div>
              {paused ? (
                <>
                  <span className="pause-status">
                    <Icon name="pause" size={14} />
                    已暂停至 {pausedLabel}
                  </span>
                  <button className="btn" onClick={() => void call(api.pauseReminders(null)).catch(report)}>
                    恢复
                  </button>
                </>
              ) : (
                <>
                  <button className="btn" onClick={() => void call(api.pauseReminders('hour')).catch(report)}>
                    暂停 1 小时
                  </button>
                  <button className="btn" onClick={() => void call(api.pauseReminders('tomorrow')).catch(report)}>
                    暂停到明天
                  </button>
                </>
              )}
            </div>
            <div className="setting">
              <div className="txt">
                <b>默认提醒</b>
                <span>新建或首次设置时间的事项自动添加</span>
              </div>
              <Select<Settings['defaultReminder']>
                ariaLabel="默认提醒"
                width={160}
                value={settings.defaultReminder}
                onChange={(v) => set('defaultReminder', v)}
                options={[
                  { value: -1, label: '不提醒' },
                  { value: 0, label: '准时' },
                  { value: 5, label: '提前 5 分钟' },
                  { value: 15, label: '提前 15 分钟' },
                  { value: 30, label: '提前 30 分钟' },
                  { value: 60, label: '提前 1 小时' },
                ]}
              />
            </div>
            <div className="setting">
              <div className="txt">
                <b>全天事项提醒时间</b>
                <span>全天事项的"准时"提醒在当天这个时间触发</span>
              </div>
              <input
                type="time"
                className="input"
                style={{ width: 160 }}
                aria-label="全天事项提醒时间"
                value={settings.allDayTime}
                onChange={(e) => e.target.value && set('allDayTime', e.target.value)}
              />
            </div>
            <div className="setting">
              <div className="txt">
                <b>稍后提醒时长</b>
                <span>在通知中点击「稍后提醒」后再次提醒的间隔</span>
              </div>
              <Select<Settings['snoozeMinutes']>
                ariaLabel="稍后提醒时长"
                width={160}
                value={settings.snoozeMinutes}
                onChange={(v) => set('snoozeMinutes', v)}
                options={([5, 10, 15, 30, 60] as const).map((m) => ({ value: m, label: `${m} 分钟` }))}
              />
            </div>
            <Switch
              id="sound"
              label="提醒声音"
              hint="使用系统默认通知声音"
              checked={settings.reminderSound}
              onChange={(v) => set('reminderSound', v)}
            />
            <div className="setting">
              <div className="txt">
                <b>测试系统通知</b>
                <span>发送一条带「完成」「稍后提醒」按钮的通知，检查系统通知是否被勿扰模式屏蔽</span>
              </div>
              <button className="btn" onClick={() => void call(api.testNotify()).catch(report)}>
                <Icon name="bell" size={14} />
                发送
              </button>
            </div>
          </div>
        </section>

        <section>
          <h2>关于</h2>
          <div className="setting-card">
            <div className="setting">
              <div className="txt">
                <b>XTodoY {info?.version}</b>
                <span>
                  Electron {info?.electron} · 数据库版本 {info?.dbSchemaVersion} · 数据仅保存在本机
                </span>
                <span style={{ display: 'block', wordBreak: 'break-all' }}>数据目录：{info?.dataDir}</span>
              </div>
              <a href="https://github.com/AhDaii/XTodoY" target="_blank" rel="noopener noreferrer">
                项目主页
              </a>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

export function StatsPage() {
  return (
    <main className="main" aria-label="统计">
      <header className="main-header">
        <div>
          <h1>统计</h1>
          <div className="sub">日 / 周 / 月完成统计</div>
        </div>
      </header>
      <div className="main-scroll">
        <div className="empty">
          <div className="badge">
            <Icon name="chart" size={28} />
          </div>
          <h2>统计将在下一个迭代提供</h2>
          <p>完成记录已经在记录中，届时可直接查看历史数据。</p>
        </div>
      </div>
    </main>
  );
}
