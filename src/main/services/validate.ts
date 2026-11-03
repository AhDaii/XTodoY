// IPC 入参的运行时校验（ipc.md §1）：渲染进程的输入一律视为不可信
import { validateRule, type RepeatRule } from '@shared/recurrence';
import { LIMITS, TAG_COLORS, type Priority, type ReminderSpec, type TagColor } from '@shared/types';
import { invalid } from './errors';

export function str(v: unknown, field: string, { min = 0, max = Infinity, trim = true } = {}): string {
  if (typeof v !== 'string') throw invalid(`${field}格式不正确`);
  const s = trim ? v.trim() : v;
  if (s.length < min) throw invalid(min === 1 ? `${field}不能为空` : `${field}至少 ${min} 个字符`);
  if (s.length > max) throw invalid(`${field}不能超过 ${max} 个字符`);
  return s;
}

export const id = (v: unknown, field = 'ID'): string => str(v, field, { min: 1, max: 64 });

export function optId(v: unknown, field = 'ID'): string | null {
  return v === null || v === undefined ? null : id(v, field);
}

export function date(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) {
    throw invalid('日期格式应为 YYYY-MM-DD');
  }
  return v;
}

export function time(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) throw invalid('时间格式应为 HH:mm');
  return v;
}

export function priority(v: unknown): Priority {
  if (v === 0 || v === 1 || v === 2 || v === 3) return v;
  throw invalid('优先级只能是 0–3');
}

export function color(v: unknown): TagColor {
  if (TAG_COLORS.includes(v as TagColor)) return v as TagColor;
  throw invalid('不支持的标签颜色');
}

export const title = (v: unknown): string => str(v, '标题', { min: 1, max: LIMITS.titleMax });
export const note = (v: unknown): string => str(v, '备注', { max: LIMITS.noteMax, trim: false });
export const tagName = (v: unknown): string => str(v, '标签名称', { min: 1, max: LIMITS.tagNameMax });

/** 只允许列出的字段，拒绝未知字段 */
export function obj<K extends string>(v: unknown, allowed: readonly K[]): Partial<Record<K, unknown>> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw invalid('参数格式不正确');
  for (const k of Object.keys(v)) if (!allowed.includes(k as K)) throw invalid(`不支持的字段：${k}`);
  return v as Partial<Record<K, unknown>>;
}

export function idList(v: unknown, field: string, max: number): string[] {
  if (!Array.isArray(v)) throw invalid(`${field}格式不正确`);
  if (v.length > max) throw invalid(`${field}最多 ${max} 个`);
  return [...new Set(v.map((x) => id(x, field)))];
}

const RANGE_MAX_MINUTES = 30 * 24 * 60;

/** 循环规则：结构与取值都校验（FR-REC-02/03） */
export function repeatRule(v: unknown): RepeatRule | null {
  if (v === null) return null;
  const o = obj(v, ['freq', 'interval', 'byDay', 'monthDay', 'end']);
  if (!['daily', 'weekdays', 'firstWorkday', 'weekly', 'monthly', 'yearly'].includes(o.freq as string))
    throw invalid('循环类型不正确');
  const e = obj(o.end, ['type', 'date', 'count']);
  let end: RepeatRule['end'];
  if (e.type === 'never') end = { type: 'never' };
  else if (e.type === 'until') end = { type: 'until', date: date(e.date) ?? '' };
  else if (e.type === 'count') end = { type: 'count', count: Number(e.count) };
  else throw invalid('结束条件不正确');
  if (o.byDay !== undefined && !Array.isArray(o.byDay)) throw invalid('星期不正确');
  const rule: RepeatRule = {
    freq: o.freq as RepeatRule['freq'],
    interval: Number(o.interval ?? 1),
    ...(o.byDay !== undefined && { byDay: [...new Set((o.byDay as unknown[]).map(Number))] }),
    ...(o.monthDay !== undefined && { monthDay: Number(o.monthDay) }),
    end,
  };
  const err = validateRule(rule);
  if (err) throw invalid(err);
  return rule;
}

/** 提醒列表（FR-REM-01）：相对提醒 0–30 天，绝对提醒为毫秒时间戳 */
export function reminderList(v: unknown): ReminderSpec[] {
  if (!Array.isArray(v)) throw invalid('提醒格式不正确');
  if (v.length > LIMITS.remindersPerTodo) throw invalid(`每个待办最多 ${LIMITS.remindersPerTodo} 个提醒`);
  return v.map((x): ReminderSpec => {
    const o = obj(x, ['kind', 'offsetMinutes', 'at']);
    const m = o.offsetMinutes;
    if (o.kind === 'relative' && Number.isInteger(m) && (m as number) >= 0 && (m as number) <= RANGE_MAX_MINUTES) {
      return { kind: 'relative', offsetMinutes: m as number };
    }
    if (o.kind === 'absolute' && Number.isInteger(o.at) && (o.at as number) > 0)
      return { kind: 'absolute', at: o.at as number };
    throw invalid('提醒设置不正确');
  });
}
