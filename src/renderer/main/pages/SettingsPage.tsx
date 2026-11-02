import { useEffect, useState } from 'react';
import type { AppInfo } from '@shared/ipc';
import type { Settings } from '@shared/types';
import { Icon, type IconName } from '../components/Icon';
import { api, call } from '../lib/api';
import { useReportError } from '../lib/data';
import { useUi } from '../lib/store';

/** 设置页（UI-10）：P4 提供通用、外观、悬浮窗与关于；提醒、数据、更新在 P5 / P6 补齐 */
export function SettingsPage({ settings }: { settings: Settings }) {
  const report = useReportError();
  const toggleSidebar = useUi((s) => s.toggleSidebar);
  const [info, setInfo] = useState<AppInfo | null>(null);
  useEffect(() => void call(api.appInfo()).then(setInfo).catch(report), [report]);
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
        <button className="icon-btn" onClick={toggleSidebar} aria-label="折叠侧边栏">
          <Icon name="panelLeft" />
        </button>
        <div>
          <h1>设置</h1>
          <div className="sub">修改即时生效</div>
        </div>
      </header>
      <div className="main-scroll settings">
        <section>
          <h2>通用</h2>
          <div className="setting-card">
            <div className="setting">
              <div className="txt">
                <b>关闭主窗口时</b>
                <span>选择"最小化到托盘"可继续接收提醒</span>
              </div>
              <select
                className="select"
                aria-label="关闭主窗口时"
                value={settings.closeAction}
                onChange={(e) => set('closeAction', e.target.value as Settings['closeAction'])}
              >
                <option value="tray">最小化到托盘</option>
                <option value="quit">退出程序</option>
              </select>
            </div>
            <div className="setting">
              <div className="txt">
                <b>每周起始日</b>
                <span>影响日期选择器、"本周"分组与周统计</span>
              </div>
              <select
                className="select"
                aria-label="每周起始日"
                value={settings.weekStart}
                onChange={(e) => set('weekStart', Number(e.target.value) as 0 | 1)}
              >
                <option value={1}>周一</option>
                <option value={0}>周日</option>
              </select>
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
                <b>测试系统通知</b>
                <span>发送一条带「完成」「稍后提醒」按钮的通知；提醒设置将在下一版本提供</span>
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
  const toggleSidebar = useUi((s) => s.toggleSidebar);
  return (
    <main className="main" aria-label="统计">
      <header className="main-header">
        <button className="icon-btn" onClick={toggleSidebar} aria-label="折叠侧边栏">
          <Icon name="panelLeft" />
        </button>
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
