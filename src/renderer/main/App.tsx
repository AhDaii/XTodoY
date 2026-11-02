import { useCallback, useEffect, useRef } from 'react';
import type { SmartView } from '@shared/types';
import { DetailPanel } from './components/DetailPanel';
import { Icon, Logo } from './components/Icon';
import { Toast } from './components/Overlay';
import { Sidebar } from './components/Sidebar';
import { api, call } from './lib/api';
import { useCounts, useReportError, useSettings, useTagTree } from './lib/data';
import { useUi } from './lib/store';
import { ListPage } from './pages/ListPage';
import { SettingsPage, StatsPage } from './pages/SettingsPage';
import { TagsPage } from './pages/TagsPage';

const VIEW_KEYS: SmartView[] = ['today', 'plan', 'all', 'done', 'trash'];

export function App() {
  const counts = useCounts();
  const tags = useTagTree();
  const settings = useSettings();
  const { route, selectedId, search, go, select, setSearch } = useUi();
  const report = useReportError();
  const collapsed = settings?.sidebarCollapsed ?? false;
  // 折叠状态保存在设置里，重启后保持（标题栏按钮 / Ctrl+B）
  const toggleSidebar = useCallback(
    () => void call(api.settings.set('sidebarCollapsed', !collapsed)).catch(report),
    [collapsed, report],
  );
  const searchRef = useRef<HTMLInputElement>(null);

  // 托盘 / 通知 / 悬浮窗要求跳转（nav:open）
  useEffect(
    () =>
      api.on.navOpen((nav) => {
        if (nav.view === 'settings') go({ kind: 'page', page: 'settings' });
        else if (nav.view === 'today') go({ kind: 'view', view: 'today' });
        if (nav.todoId) select(nav.todoId);
      }),
    [go, select],
  );

  // 全局快捷键（IR-02）
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.ctrlKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        const r = useUi.getState().route;
        if (r.kind === 'page' || (r.kind === 'view' && (r.view === 'done' || r.view === 'trash'))) {
          go({ kind: 'view', view: 'today' });
        }
        setTimeout(() => document.getElementById('quick-add')?.focus());
      } else if (e.ctrlKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleSidebar();
      } else if (e.ctrlKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.ctrlKey && e.key === ',') {
        e.preventDefault();
        go({ kind: 'page', page: 'settings' });
      } else if (e.ctrlKey && /^[1-5]$/.test(e.key)) {
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
    <ListPage tags={tags} counts={counts} />
  ) : route.page === 'tags' ? (
    <TagsPage tags={tags} />
  ) : route.page === 'settings' && settings ? (
    <SettingsPage settings={settings} />
  ) : (
    <StatsPage />
  );

  return (
    <div className="window">
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
          <kbd>Ctrl+F</kbd>
        </label>
      </header>
      <div className={`body ${collapsed ? 'sidebar-collapsed' : ''}`}>
        <Sidebar counts={counts} tags={tags} rail={collapsed} onToggle={toggleSidebar} />
        {page}
        {showList && selectedId && settings && (
          <DetailPanel id={selectedId} tags={tags} weekStart={settings.weekStart} />
        )}
      </div>
      <Toast />
    </div>
  );
}
