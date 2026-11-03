import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

// 主题以主进程推送为准（theme:changed）；首帧先按 prefers-color-scheme，避免闪烁
const applyTheme = (dark: boolean): void => {
  document.documentElement.classList.toggle('dark', dark);
};
applyTheme(window.matchMedia('(prefers-color-scheme: dark)').matches);
window.xtodoy.on.themeChanged(({ dark }) => applyTheme(dark));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
