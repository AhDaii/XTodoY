import { powerMonitor } from 'electron';
import { bus } from '../events/bus';

/**
 * 休眠唤醒、解锁后发出 time.jumped，提醒调度与今日计数据此补发 / 重算（FR-REM-07、IR-06）。
 * 系统时间被手动调整的情况由调度器定时器触发时的漂移检测覆盖（domain/time.ts detectTimeJump）。
 */
export function watchPower(): void {
  powerMonitor.on('resume', () => bus.emit('time.jumped', 'resume'));
  powerMonitor.on('unlock-screen', () => bus.emit('time.jumped', 'resume'));
}
