import { powerMonitor } from 'electron';
import { readZone, zoneChanged } from '../domain/timezone';
import { bus } from '../events/bus';

const ZONE_CHECK_MS = 60_000;

/**
 * 休眠唤醒、解锁后发出 time.jumped，提醒调度与今日计数据此补发 / 重算（FR-REM-07、IR-06）。
 * 系统时间被手动调整的情况由调度器定时器触发时的漂移检测覆盖（domain/time.ts detectTimeJump）。
 */
export function watchPower(): void {
  powerMonitor.on('resume', () => {
    checkZone();
    bus.emit('time.jumped', 'resume');
  });
  powerMonitor.on('unlock-screen', () => {
    checkZone();
    bus.emit('time.jumped', 'resume');
  });
  watchTimezone();
}

// 用户自己设置了 TZ 环境变量时尊重它，不做检测
const userTz = process.env['TZ'] !== undefined;
let zone = readZone();

/**
 * 时区变化（FR-REC-08）：Node 会缓存时区，系统改时区后不会自动感知。
 * 删除 TZ 环境变量会让 Node / ICU 重新读取系统时区；每分钟检查一次（满足 NFR-PERF-04 不超过 1 次 / 分钟的唤醒）。
 */
function checkZone(): void {
  if (userTz) return;
  delete process.env['TZ'];
  const next = readZone();
  if (!zoneChanged(zone, next)) return;
  console.info(`[time] zone changed ${zone.id} (${zone.offset}) -> ${next.id} (${next.offset})`);
  zone = next;
  bus.emit('time.jumped', 'timezone');
}

function watchTimezone(): void {
  if (userTz) return;
  setInterval(checkZone, ZONE_CHECK_MS).unref();
}
