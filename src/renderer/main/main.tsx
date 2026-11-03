import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles.css';

// 主题以主进程推送为准（theme:changed）；首帧先按 prefers-color-scheme，避免闪烁
const applyTheme = (dark: boolean): void => {
  document.documentElement.classList.toggle('dark', dark);
};
applyTheme(window.matchMedia('(prefers-color-scheme: dark)').matches);
window.xtodoy.on.themeChanged(({ dark }) => applyTheme(dark));

// 事件回调等渲染以外的错误：同样写入主进程日志（经 console-message 转发）
window.addEventListener('unhandledrejection', (e) => console.error('[renderer] unhandled rejection', e.reason));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
