import type { TodayCount } from '@shared/ipc';

const tile = document.getElementById('tile') as HTMLButtonElement;
const n = document.getElementById('n') as HTMLSpanElement;
const lbl = document.getElementById('lbl') as HTMLSpanElement;

/** 三种状态：有未完成 / 全部完成 / 无待办（FR-FLT-03） */
function render(c: TodayCount): void {
  const allDone = c.total > 0 && c.open === 0;
  tile.classList.toggle('is-done', allDone);
  tile.classList.toggle('is-empty', c.total === 0);
  n.textContent = allDone ? '✓' : c.open > 99 ? '99+' : String(c.open);
  n.classList.toggle('small', c.open > 99);
  lbl.textContent = allDone ? '全部完成' : '今日';
  tile.title = c.total ? `今日已完成 ${c.done} / 共 ${c.total}` : '今天没有到期的事项';
  tile.setAttribute('aria-label', `${tile.title}，单击打开主窗口`);
}

void window.xtodoy.getToday().then(render);
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
    window.xtodoy.moveBy(e.screenX - last.x, e.screenY - last.y);
    last = { x: e.screenX, y: e.screenY };
  }
});

tile.addEventListener('pointerup', (e) => {
  if (!start) return;
  tile.releasePointerCapture(e.pointerId);
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
