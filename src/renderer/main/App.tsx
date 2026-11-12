import { useCallback, useEffect, useRef, type CSSProperties } from 'react';
import type { SmartView } from '@shared/types';
import { DetailPanel } from './components/DetailPanel';
import { Icon, Logo } from './components/Icon';
import { Toast } from './components/Overlay';
import { Sidebar } from './components/Sidebar';
import { api, call } from './lib/api';
import { updateNeedsAttention } from '@shared/update';
import { InstallingOverlay, UpdateDialog } from './components/Update';
import { backgroundAccent, accentTokens, type BackgroundSettings } from '@shared/background';
import { useBackgroundUrl, useCounts, useReportError, useSettings, useTagTree, useUpdateStatus } from './lib/data';
import { setSoundPrefs } from './lib/sounds';
import { kbd, mod } from './lib/platform';
import { useUi } from './lib/store';
import { ListPage } from './pages/ListPage';
import { SettingsPage } from './pages/SettingsPage';
import { StatsPage } from './pages/StatsPage';
import { TagsPage } from './pages/TagsPage';

const VIEW_KEYS: SmartView[] = ['today', 'plan', 'all', 'done', 'trash'];

export function App() {
  const counts = useCounts();
  const tags = useTagTree();
  const settings = useSettings();
  const { route, selectedId, search, go, select, setSearch, updateDialog, installing, setUpdateDialog } = useUi();
  const upd = useUpdateStatus();
  const settingsBadge =
    upd && updateNeedsAttention(upd) ? (upd.phase === 'ready' ? '更新已就绪' : `新版本 ${upd.latest} 可用`) : null;
  const report = useReportError();
  const collapsed = settings?.sidebarCollapsed ?? false;
  // 折叠状态保存在设置里，重启后保持（标题栏按钮 / Ctrl+B）
  const toggleSidebar = useCallback(
    () => void call(api.settings.set('sidebarCollapsed', !collapsed)).catch(report),
    [collapsed, report],
  );
  const searchRef = useRef<HTMLInputElement>(null);

  // 界面音效设置（#37）
  useEffect(() => {
    if (settings)
      setSoundPrefs({
        uiSound: settings.uiSound,
        uiSoundStyle: settings.uiSoundStyle,
        uiSoundVolume: settings.uiSoundVolume,
      });
  }, [settings]);

  // 托盘 / 通知 / 悬浮窗要求跳转（nav:open）
  useEffect(
    () =>
      api.on.navOpen((nav) => {
        if (nav.view === 'settings') go({ kind: 'page', page: 'settings' });
        else if (nav.view === 'today') go({ kind: 'view', view: 'today' });
        if (nav.todoId) select(nav.todoId);
        if (nav.focus === 'quick-add') setTimeout(() => document.getElementById('quick-add')?.focus(), 50);
        // 更新通知：打开设置并显示更新详情（FR-UPD-03）
        if (nav.focus === 'update') setUpdateDialog(true);
      }),
    [go, select, setUpdateDialog],
  );

  // 全局快捷键（IR-02）
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (mod(e) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        const r = useUi.getState().route;
        if (r.kind === 'page' || (r.kind === 'view' && (r.view === 'done' || r.view === 'trash'))) {
          go({ kind: 'view', view: 'today' });
        }
        setTimeout(() => document.getElementById('quick-add')?.focus());
      } else if (mod(e) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleSidebar();
      } else if (mod(e) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (mod(e) && e.key === ',') {
        e.preventDefault();
        go({ kind: 'page', page: 'settings' });
      } else if (mod(e) && /^[1-5]$/.test(e.key)) {
        e.preventDefault();
        go({ kind: 'view', view: VIEW_KEYS[Number(e.key) - 1]! });
      } else if (e.key === 'Escape' && useUi.getState().selectedId && !document.querySelector('.overlay')) {
        select(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, select, toggleSidebar]);

  const showList = route.kind !== 'page' || search !== '';
  const page = showList ? (
    <ListPage tags={tags} counts={counts} settings={settings} updatedTo={upd?.justUpdated ?? null} />
  ) : route.page === 'tags' ? (
    <TagsPage tags={tags} />
  ) : route.page === 'settings' && settings ? (
    <SettingsPage settings={settings} update={upd} />
  ) : (
    <StatsPage weekStart={settings?.weekStart ?? 1} />
  );

  // 窗口背景图（#41 方案 A）：背景层铺满窗口，侧边栏与内容区变为半透明面板
  const bg = settings?.background;
  const bgUrl = useBackgroundUrl(bg?.image);
  const bgStyle = bg && bgUrl ? ({ ...backgroundVars(bg), '--bg-img': bgUrl } as CSSProperties) : undefined;

  return (
    <div className={`window ${bgStyle ? 'has-bg' : ''}`} style={bgStyle}>
      {bgStyle && <div className="app-bg" aria-hidden="true" />}
      <header className="titlebar">
        <div className="brand">
          <Logo />
          <span>XTodoY</span>
        </div>
        <label className="search">
          <Icon name="search" size={14} />
          <span className="sr-only">搜索</span>
          <input
            id="search"
            ref={searchRef}
            placeholder="搜索待办"
            autoComplete="off"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setSearch('')}
          />
          <kbd>{kbd('Ctrl+F')}</kbd>
        </label>
      </header>
      <div className={`body ${collapsed ? 'sidebar-collapsed' : ''}`}>
        <Sidebar counts={counts} tags={tags} rail={collapsed} onToggle={toggleSidebar} settingsBadge={settingsBadge} />
        {page}
        {showList && selectedId && settings && (
          <DetailPanel id={selectedId} tags={tags} weekStart={settings.weekStart} allDayTime={settings.allDayTime} />
        )}
      </div>
      <Toast />
      {updateDialog && upd && (upd.latest || upd.justUpdated) && <UpdateDialog status={upd} />}
      {installing && <InstallingOverlay version={upd?.latest} />}
    </div>
  );
}

/**
 * 背景图的 CSS 变量（#41）与取自背景的主色（#47 方案 B）：同时给出浅色 / 深色主题下调整过对比度的主色，
 * 由 app.css 按当前主题选用；没有主色（黑白照片）时沿用品牌蓝。
 */
function backgroundVars(bg: BackgroundSettings): Record<string, string | number> {
  const vars: Record<string, string | number> = {
    '--bg-blur': `${bg.blur}px`,
    '--bg-dim': bg.dim,
    '--bg-panel': `${Math.round(bg.panel * 100)}%`,
    '--bg-pos': bg.position,
  };
  const accent = backgroundAccent(bg);
  if (accent)
    for (const [suffix, dark] of [
      ['l', false],
      ['d', true],
    ] as const) {
      const t = accentTokens(accent, dark);
      vars[`--acc-${suffix}`] = t.primary;
      vars[`--acc-${suffix}-hover`] = t.hover;
      vars[`--acc-${suffix}-soft-fg`] = t.softFg;
    }
  return vars;
}
