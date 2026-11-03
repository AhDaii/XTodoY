// 统计页数据（SRS F8，IPC `stats:get`）
import type { TagColor } from './types';

export type StatsPeriodKind = 'day' | 'week' | 'month';

export interface StatsQuery {
  period: StatsPeriodKind;
  /** 0 为本期，-1 为上一期……不允许大于 0 */
  offset: number;
  /** 标签分布下钻到某个根标签（FR-STA-04） */
  tagId?: string;
}

export interface StatsTag {
  id: string;
  name: string;
  color: TagColor;
}

export interface StatsLog {
  id: string;
  todoId: string | null;
  title: string;
  /** 完成时间（毫秒） */
  at: number;
  /** 完成时的本地日期 / 小时（统计按它归属，D-10） */
  date: string;
  hour: number;
  /** 完成时第一个标签的根标签；标签已删除则为 null */
  tag: StatsTag | null;
}

export interface StatsSlice {
  /** null 表示"无标签"；下钻时为父标签自身则 self 为 true */
  tag: StatsTag | null;
  self?: boolean;
  count: number;
}

export interface Stats {
  period: StatsPeriodKind;
  offset: number;
  today: string;
  from: string;
  to: string;
  prevFrom: string;
  prevTo: string;
  elapsed: number;
  /** 本期完成数，与上期同期完成数 */
  total: number;
  prevTotal: number;
  /** 本期（已过去的日子中）完成最多的一天 */
  best: { date: string; count: number } | null;
  /** 0–23 每小时完成数 */
  hours: number[];
  /** from..to 每天的完成数 */
  daily: { date: string; count: number }[];
  /** 上一周期每天的完成数（与 daily 按位置对齐，月视图长度可能不同） */
  prevDaily: number[];
  /** 截止日期落在本期内的事项及其中已完成的数量（FR-STA-03） */
  due: { total: number; done: number };
  streak: { current: number; best: number; last7: { date: string; on: boolean }[] };
  /** 按根标签分布；query.tagId 存在时为该标签下一级子标签的分布 */
  byTag: StatsSlice[];
  drill: StatsTag | null;
  /** 完成明细（按完成时间倒序，最多 LOG_LIMIT 条） */
  logs: StatsLog[];
  logsTruncated: boolean;
}

export const STATS_LOG_LIMIT = 500;
