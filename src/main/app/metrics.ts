import { app } from 'electron';
import { writeFileSync } from 'node:fs';
import { createFloatingWindow, showMainWindow } from '../platform/windows';

/**
 * P3 技术验证：按场景启动后采样所有进程的内存与 CPU，写入 JSON 后退出。
 * 由 scripts/measure-memory.mjs 通过环境变量驱动，正常启动时不生效。
 *   XTODOY_METRICS_SCENARIO = tray | floating | main
 *   XTODOY_METRICS_OUT      = 结果文件路径
 */
export function runMetricsIfRequested(): boolean {
  const scenario = process.env['XTODOY_METRICS_SCENARIO'];
  const out = process.env['XTODOY_METRICS_OUT'];
  if (!scenario || !out) return false;

  if (scenario === 'floating' || scenario === 'main') createFloatingWindow();
  if (scenario === 'main') showMainWindow();
  // 打开主窗口 5 秒后关闭（销毁），验证内存能否回落到"托盘 + 悬浮窗"水平
  if (scenario === 'main-closed') {
    createFloatingWindow();
    const win = showMainWindow();
    setTimeout(() => win.close(), 5000);
  }

  const settleMs = Number(process.env['XTODOY_METRICS_SETTLE_MS'] ?? 15000);
  const samples: { t: number; privateMB: number; workingSetMB: number; cpu: number; processes: number }[] = [];
  setTimeout(() => {
    // 第一次调用 getAppMetrics 的 CPU 值无意义，先预热一次；同时写出进程 PID，供外部脚本查询"专用工作集"
    writeFileSync(`${out}.pids`, JSON.stringify(app.getAppMetrics().map((p) => p.pid)));
    const timer = setInterval(() => {
      const m = app.getAppMetrics();
      samples.push({
        t: Date.now(),
        privateMB: m.reduce((s, p) => s + (p.memory.privateBytes ?? p.memory.workingSetSize), 0) / 1024,
        workingSetMB: m.reduce((s, p) => s + p.memory.workingSetSize, 0) / 1024,
        cpu: m.reduce((s, p) => s + p.cpu.percentCPUUsage, 0),
        processes: m.length,
      });
      if (samples.length >= 10) {
        clearInterval(timer);
        const last = app.getAppMetrics().map((p) => ({
          type: p.type,
          name: p.name ?? p.serviceName ?? '',
          privateMB: +((p.memory.privateBytes ?? 0) / 1024).toFixed(1),
          workingSetMB: +(p.memory.workingSetSize / 1024).toFixed(1),
        }));
        writeFileSync(out, JSON.stringify({ scenario, samples, processes: last }, null, 2));
        app.exit(0);
      }
    }, 2000);
  }, settleMs);
  return true;
}
