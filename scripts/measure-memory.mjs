// P3 技术验证：分场景测量常驻内存与空闲 CPU（NFR-PERF-01~04）。
// 用法：pnpm build && node scripts/measure-memory.mjs [--packaged] [场景...]
// 场景：tray | floating | main | main-closed（默认全部）。--packaged 使用 release/<版本>/win-unpacked 中的安装版。
// 口径：SRS 规定的"任务管理器 · 内存（专用工作集）"，通过 WMI WorkingSetPrivate 读取并对所有进程求和。
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const packaged = args.includes('--packaged');
const scenarios = args.filter((a) => !a.startsWith('--'));
const list = scenarios.length ? scenarios : ['tray', 'floating', 'main', 'main-closed'];
const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
const exe = packaged ? join('release', version, 'win-unpacked', 'XTodoY.exe') : require('electron');
const exeArgs = packaged ? [] : ['.'];

/** 读取一组进程的"专用工作集"（MB），与任务管理器默认列一致 */
function privateWorkingSetMB(pids) {
  const filter = pids.map((p) => `IDProcess=${p}`).join(' or ');
  const ps = `(Get-CimInstance Win32_PerfFormattedData_PerfProc_Process -Filter '${filter}' | Measure-Object WorkingSetPrivate -Sum).Sum`;
  const bytes = Number(execFileSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).trim());
  return bytes / 1024 / 1024;
}

const results = [];
for (const scenario of list) {
  const dir = mkdtempSync(join(tmpdir(), 'xtodoy-metrics-'));
  const out = join(dir, 'metrics.json');
  const child = spawn(exe, exeArgs, {
    env: {
      ...process.env,
      XTODOY_METRICS_SCENARIO: scenario,
      XTODOY_METRICS_OUT: out,
      XTODOY_DATA_DIR: join(dir, 'data'),
    },
    stdio: 'inherit',
  });
  const exited = new Promise((r) => child.on('exit', r));
  while (!existsSync(`${out}.pids`)) await sleep(500);
  await sleep(2000);
  const pids = JSON.parse(readFileSync(`${out}.pids`, 'utf8'));
  const pws = [];
  for (let i = 0; i < 3; i++) {
    pws.push(privateWorkingSetMB(pids));
    await sleep(3000);
  }
  await exited;
  const data = JSON.parse(readFileSync(out, 'utf8'));
  const s = data.samples;
  const avg = (k) => s.reduce((a, x) => a + x[k], 0) / s.length;
  results.push({
    scenario,
    processes: s.at(-1).processes,
    '专用工作集 MB': +(pws.reduce((a, b) => a + b, 0) / pws.length).toFixed(1),
    'private bytes MB': +avg('privateMB').toFixed(1),
    'CPU % avg': +avg('cpu').toFixed(2),
    'CPU % max': +Math.max(...s.map((x) => x.cpu)).toFixed(2),
  });
  if (args.includes('--detail')) console.table(data.processes);
  rmSync(dir, { recursive: true, force: true });
}
console.log(`\n${packaged ? '安装版' : '开发构建'}${process.env.XTODOY_ENABLE_GPU ? '（开启硬件加速）' : ''}：`);
console.table(results);
