import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { setHolidayData } from '@shared/workdays';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles.css';

// 主题以主进程推送为准（theme:changed）；首帧先按 prefers-color-scheme，避免闪烁
const applyTheme = (dark: boolean): void => {
  document.documentElement.classList.toggle('dark', dark);
};
applyTheme(window.matchMedia('(prefers-color-scheme: dark)').matches);
window.xtodoy.on.themeChanged(({ dark }) => applyTheme(dark));

// 工作日日历与主进程使用同一份节假日数据（循环预览"接下来 5 次"）
void window.xtodoy.holidays.get().then((r) => r.ok && setHolidayData(r.data));
window.xtodoy.on.holidaysChanged(setHolidayData);

// 事件回调等渲染以外的错误：同样写入主进程日志（经 console-message 转发）
window.addEventListener('unhandledrejection', (e) => console.error('[renderer] unhandled rejection', e.reason));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
