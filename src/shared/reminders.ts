// 提醒的显示文字与预设选项（主进程通知正文与界面共用）
import type { ReminderSpec } from './types';

/** 详情面板中的相对提醒预设（分钟） */
export const REMINDER_PRESETS: readonly number[] = [0, 5, 15, 30, 60, 120, 1440];
/** 全天事项只提供"当天"与"提前 N 天" */
export const ALL_DAY_PRESETS: readonly number[] = [0, 1440, 2880];

/** 提醒的显示文字（详情面板、列表悬停） */
export function reminderLabel(spec: ReminderSpec, allDay: boolean, allDayTime: string): string {
  if (spec.kind === 'absolute') {
    const d = new Date(spec.at);
    return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  const m = spec.offsetMinutes;
  if (allDay) {
    if (m === 0) return `当天 ${allDayTime}`;
    if (m % 1440 === 0) return `提前 ${m / 1440} 天 ${allDayTime}`;
  }
  if (m === 0) return '准时';
  if (m % 1440 === 0) return `提前 ${m / 1440} 天`;
  if (m % 60 === 0) return `提前 ${m / 60} 小时`;
  return `提前 ${m} 分钟`;
}
