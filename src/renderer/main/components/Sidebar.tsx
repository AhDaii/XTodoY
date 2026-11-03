import type { KeyboardEvent } from 'react';
import type { SmartView, TagNode, ViewCounts } from '@shared/types';
import { useUi, type Route } from '../lib/store';
import { Icon, type IconName } from './Icon';

const SMART: [SmartView, IconName, string, number][] = [
  ['today', 'sun', '今天', 1],
  ['plan', 'calendar', '计划', 2],
  ['all', 'inbox', '全部', 3],
  ['done', 'checkCircle', '已完成', 4],
  ['trash', 'trash', '回收站', 5],
];

const same = (a: Route, b: Route): boolean => JSON.stringify(a) === JSON.stringify(b);

/** rail = 折叠后的 56px 图标栏：只保留智能视图与底部入口，名称通过悬停提示与读屏标签提供 */
export function Sidebar({
  counts,
  tags,
  rail,
  onToggle,
  settingsBadge,
}: {
  counts: ViewCounts;
  tags: TagNode[];
  rail: boolean;
  onToggle(): void;
  /** 设置项上的更新圆点说明（有新版本 / 更新就绪时） */
  settingsBadge?: string | null;
}) {
  const { route, search, collapsedTags, go, toggleTag } = useUi();
  const current = (r: Route) => (!search && same(route, r) ? ('page' as const) : undefined);

  const item = (r: Route, icon: IconName, label: string, count?: number, key?: number, badge?: string | null) => (
    <button
      className="nav-item"
      aria-current={current(r)}
      aria-label={rail ? `${label}${count ? `，${count} 项` : ''}` : undefined}
      title={`${label}${rail && count ? ` · ${count}` : ''}${key ? `（Ctrl+${key}）` : ''}${badge ? ` · ${badge}` : ''}`}
      onClick={() => go(r)}
    >
      <Icon name={icon} size={rail ? 20 : 16} />
      <span className="label">{label}</span>
      {count !== undefined && <span className="count">{count}</span>}
      {rail && r.kind === 'view' && r.view === 'today' && count ? (
        <span className="rail-count" aria-hidden="true">
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
      {badge && <span className="badge-dot" role="img" aria-label={badge} />}
    </button>
  );

  const children = (parent: string | null) => tags.filter((t) => t.parentId === parent);
  const tree = (parent: string | null) =>
    children(parent).map((t) => {
      const kids = children(t.id).length > 0;
      const open = !collapsedTags.has(t.id);
      const r: Route = { kind: 'tag', tagId: t.id };
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          go(r);
        }
        if (kids && e.key === 'ArrowLeft' && open) toggleTag(t.id);
        if (kids && e.key === 'ArrowRight' && !open) toggleTag(t.id);
      };
      return (
        <div role="treeitem" aria-expanded={kids ? open : undefined} aria-level={t.depth + 1} key={t.id}>
          <div
            className={`nav-item tc-${t.color}`}
            style={{ paddingLeft: 8 + t.depth * 16 }}
            role="button"
            tabIndex={0}
            aria-current={current(r)}
            title={t.displayPath}
            onClick={() => go(r)}
            onKeyDown={onKey}
          >
            {kids ? (
              <span
                className="tree-toggle"
                role="button"
                tabIndex={-1}
                aria-expanded={open}
                aria-label={`${open ? '折叠' : '展开'} ${t.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleTag(t.id);
                }}
              >
                <Icon name="chevronDown" size={12} />
              </span>
            ) : (
              <span className="tree-spacer" />
            )}
            <span className="dot" />
            <span className="label">{t.name}</span>
            <span className="count">{t.openCount || ''}</span>
          </div>
          {kids && open && <div role="group">{tree(t.id)}</div>}
        </div>
      );
    });

  return (
    <aside id="sidebar" className={`sidebar ${rail ? 'is-rail' : ''}`} aria-label="导航">
      <nav>
        {SMART.map(([v, ic, label, key]) =>
          item({ kind: 'view', view: v }, ic, label, v === 'trash' ? undefined : counts[v], key),
        )}
        {!rail && (
          <div className="nav-section">
            <div className="nav-section-title">
              <span>标签</span>
              <button
                className="icon-btn"
                aria-label="管理标签"
                title="管理标签"
                onClick={() => go({ kind: 'page', page: 'tags' })}
              >
                <Icon name="settings" size={14} />
              </button>
            </div>
            <div role="tree" aria-label="标签">
              {tags.length ? (
                tree(null)
              ) : (
                <button className="nav-item" onClick={() => go({ kind: 'page', page: 'tags' })}>
                  <Icon name="plus" />
                  <span className="label">新建标签</span>
                </button>
              )}
            </div>
          </div>
        )}
      </nav>
      <div className="sidebar-footer">
        {item({ kind: 'page', page: 'stats' }, 'chart', '统计')}
        {item({ kind: 'page', page: 'tags' }, 'tag', '标签管理')}
        {item({ kind: 'page', page: 'settings' }, 'settings', '设置', undefined, undefined, settingsBadge)}
        {/* 折叠按钮固定在侧边栏底部：展开时为"收起侧边栏"，图标栏中为展开图标 */}
        <button
          className="nav-item sidebar-toggle"
          aria-controls="sidebar"
          aria-expanded={!rail}
          aria-label={rail ? '展开侧边栏（Ctrl+B）' : '收起侧边栏（Ctrl+B）'}
          title={rail ? '展开侧边栏（Ctrl+B）' : '收起侧边栏（Ctrl+B）'}
          onClick={onToggle}
        >
          <Icon name={rail ? 'panelLeftOpen' : 'panelLeftClose'} size={rail ? 20 : 16} />
          <span className="label">收起侧边栏</span>
          <kbd className="count">Ctrl+B</kbd>
        </button>
      </div>
    </aside>
  );
}
