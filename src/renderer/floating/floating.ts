import type { TodayCount } from '@shared/ipc';

const tile = document.getElementById('tile') as HTMLButtonElement;
const n = document.getElementById('n') as HTMLSpanElement;
const lbl = document.getElementById('lbl') as HTMLSpanElement;
const bar = document.getElementById('bar') as unknown as SVGCircleElement;

// 进度环周长（r = 26）
const C = 2 * Math.PI * 26;
bar.setAttribute('stroke-dasharray', String(C));
bar.setAttribute('stroke-dashoffset', String(C));

/** 三种状态：有未完成 / 全部完成 / 无待办（FR-FLT-03）；环表示今日已完成 / 今日共 */
function render(c: TodayCount): void {
  const allDone = c.total > 0 && c.open === 0;
  tile.classList.toggle('is-done', allDone);
  tile.classList.toggle('is-empty', c.total === 0);
  n.textContent = c.open > 99 ? '99+' : String(c.open);
  n.classList.toggle('small', c.open > 99);
  lbl.textContent = allDone ? '完成' : '今日';
  // 有待办但一项都没完成时留一小段，表明环是进度而不是装饰
  const ratio = c.total ? Math.max(c.done / c.total, c.open ? 0.02 : 1) : 0;
  bar.setAttribute('stroke-dashoffset', String(C * (1 - ratio)));
  tile.title = c.total
    ? allDone
      ? `今日 ${c.total} 项已全部完成`
      : `今日未完成 ${c.open} 项 · 已完成 ${c.done} / 共 ${c.total}`
    : '今天没有到期的事项';
  tile.setAttribute('aria-label', `${tile.title}，单击打开主窗口`);
}

void window.xtodoy.getToday().then((r) => r.ok && render(r.data));
window.xtodoy.onTodayCount(render);

// 主题以主进程推送为准，首帧按系统设置
const applyTheme = (dark: boolean): void => {
  document.documentElement.classList.toggle('dark', dark);
};
applyTheme(window.matchMedia('(prefers-color-scheme: dark)').matches);
window.xtodoy.onThemeChanged(({ dark }) => applyTheme(dark));

// 拖动与单击区分：移动超过 3px 视为拖动，拖动结束不触发打开（FR-FLT-04）
let start: { x: number; y: number } | null = null;
let last = { x: 0, y: 0 };
let dragging = false;

tile.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  tile.setPointerCapture(e.pointerId);
  start = { x: e.screenX, y: e.screenY };
  last = { ...start };
  dragging = false;
});

tile.addEventListener('pointermove', (e) => {
  if (!start) return;
  if (!dragging && Math.hypot(e.screenX - start.x, e.screenY - start.y) > 3) dragging = true;
  if (dragging) {
    tile.classList.add('dragging');
    window.xtodoy.moveBy(e.screenX - last.x, e.screenY - last.y);
    last = { x: e.screenX, y: e.screenY };
  }
});

tile.addEventListener('pointerup', (e) => {
  if (!start) return;
  tile.releasePointerCapture(e.pointerId);
  tile.classList.remove('dragging');
  if (dragging) window.xtodoy.dragEnd();
  else window.xtodoy.openMain();
  start = null;
});

tile.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') window.xtodoy.openMain();
});

tile.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  window.xtodoy.showMenu();
});
