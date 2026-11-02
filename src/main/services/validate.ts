// IPC 入参的运行时校验（ipc.md §1）：渲染进程的输入一律视为不可信
import { LIMITS, TAG_COLORS, type Priority, type TagColor } from '@shared/types';
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
