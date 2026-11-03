// 时区变化检测（FR-REC-08）：纯逻辑，便于单元测试

export interface ZoneSnapshot {
  /** IANA 时区名，如 Asia/Shanghai；系统未提供时为空串 */
  id: string;
  /** 当前时刻的 UTC 偏移（分钟，与 Date#getTimezoneOffset 相同符号） */
  offset: number;
}

export function readZone(now = new Date()): ZoneSnapshot {
  return { id: Intl.DateTimeFormat().resolvedOptions().timeZone ?? '', offset: now.getTimezoneOffset() };
}

/** 时区名或偏移变化（包括夏令时切换）即视为变化，需要按新时区重新计算提醒 */
export const zoneChanged = (a: ZoneSnapshot, b: ZoneSnapshot): boolean => a.id !== b.id || a.offset !== b.offset;
