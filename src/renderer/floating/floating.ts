import type { TodayCount } from '@shared/ipc';

const tile = document.getElementById('tile') as HTMLButtonElement;
const date = document.getElementById('date') as HTMLSpanElement;
const n = document.getElementById('n') as HTMLSpanElement;
const lbl = document.getElementById('lbl') as HTMLSpanElement;
const fill = document.getElementById('fill') as HTMLElement;
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

/**
 * 日历页（设计系统 §7.5）：色带写今天日期，中间是今日未完成数，底部是今日进度。
 * 三种状态：有未完成 / 全部完成 / 无待办（FR-FLT-03）。跨零点时主进程会推送新的计数，日期随之刷新。
 */
function render(c: TodayCount): void {
  const now = new Date();
  date.textContent = `${now.getMonth() + 1}/${now.getDate()} 周${WEEK[now.getDay()]}`;
  const allDone = c.total > 0 && c.open === 0;
  tile.classList.toggle('is-done', allDone);
  tile.classList.toggle('is-empty', c.total === 0);
  n.textContent = c.open > 99 ? '99+' : String(c.open);
  n.classList.toggle('small', c.open > 99);
  lbl.textContent = allDone ? '全部完成' : c.total === 0 ? '今天无事' : '项待办';
  fill.style.width = `${c.total ? Math.round((c.done / c.total) * 100) : 0}%`;
  tile.title = c.total
    ? allDone
      ? `今日 ${c.total} 项已全部完成`
      : `今日未完成 ${c.open} 项 · 已完成 ${c.done} / 共 ${c.total}`
    : '今天没有到期的事项';
  tile.setAttribute('aria-label', `${date.textContent}，${tile.title}，单击打开主窗口`);
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
