import { useState } from 'react';
import {
  fromRRule,
  previewOccurrences,
  repeatSummary,
  type RepeatEnd,
  type RepeatFreq,
  type RepeatRule,
} from '@shared/recurrence';
import type { Todo } from '@shared/types';
import { api, call } from '../lib/api';
import { useReportError } from '../lib/data';
import { addDays, today, weekday } from '../lib/dates';
import { holidayName, holidayYears } from '@shared/workdays';
import { Select } from './Select';

type FreqOption = RepeatFreq | 'none';
const FREQS: { value: FreqOption; label: string; hint?: string }[] = [
  { value: 'none', label: '不重复' },
  { value: 'daily', label: '每天' },
  { value: 'weekdays', label: '每个工作日', hint: '按法定节假日与调休' },
  { value: 'firstWorkday', label: '工作日第一天', hint: '周末或节假日之后的第一个工作日' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
  { value: 'yearly', label: '每年' },
];
const UNIT: Record<string, string> = { daily: '天', weekly: '周', monthly: '月', yearly: '年' };

/** 预览日期旁的说明：调休上班日、节假日后的第一天 */
function dayNote(d: string): string {
  const h = holidayName(d);
  if (h && !h.offDay) return ` · ${h.name}调休上班`;
  const prev = holidayName(addDays(d, -1));
  return prev?.offDay ? ` · ${prev.name}后` : '';
}
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const WD = ['日', '一', '二', '三', '四', '五', '六'];

/** 循环规则编辑器（UI-04，FR-REC-02/03）：修改即时保存，并预览接下来 5 次 */
export function RepeatPicker({ todo, onChange }: { todo: Todo; onChange(t: Todo): void }) {
  const report = useReportError();
  const rule = todo.rrule ? fromRRule(todo.rrule) : null;
  const base = todo.dueDate ?? today();
  const [countDraft, setCountDraft] = useState(rule?.end.type === 'count' ? rule.end.count : 10);

  const save = (next: RepeatRule | null) => call(api.todos.setRepeat(todo.id, next)).then(onChange).catch(report);
  const patch = (p: Partial<RepeatRule>) => rule && void save({ ...rule, ...p });

  const setFreq = (f: FreqOption) => {
    if (f === 'none') return void save(null);
    const dow = new Date(`${base}T00:00:00`).getDay();
    void save({
      freq: f,
      interval: 1,
      ...(f === 'weekly' && { byDay: [dow] }),
      ...(f === 'monthly' && { monthDay: Number(base.slice(8)) }),
      end: rule?.end ?? { type: 'never' },
    });
  };
  const toggleDay = (d: number) => {
    if (!rule) return;
    const days = new Set(rule.byDay ?? []);
    if (days.has(d)) {
      if (days.size === 1) return; // 至少保留一天
      days.delete(d);
    } else days.add(d);
    patch({ byDay: [...days] });
  };
  const setEnd = (type: RepeatEnd['type']) =>
    patch({
      end:
        type === 'never'
          ? { type }
          : type === 'until'
            ? { type, date: addDays(base, 30) }
            : { type, count: countDraft },
    });

  const years = holidayYears();
  const preview = rule ? previewOccurrences(rule, todo.repeatAnchor ?? base, base, 5, todo.repeatCountDone) : [];

  return (
    <div className="stack" style={{ width: 288 }}>
      <h3>循环</h3>
      <Select<FreqOption>
        ariaLabel="循环类型"
        width="100%"
        value={rule?.freq ?? 'none'}
        options={FREQS}
        onChange={setFreq}
      />
      {rule && rule.freq !== 'weekdays' && rule.freq !== 'firstWorkday' && (
        <div className="row">
          <span className="help">每</span>
          <input
            type="number"
            className="input"
            style={{ width: 72 }}
            min={1}
            max={99}
            aria-label="间隔"
            value={rule.interval}
            onChange={(e) => {
              const n = Math.min(99, Math.max(1, Number(e.target.value) || 1));
              patch({ interval: n });
            }}
          />
          <span className="help">{UNIT[rule.freq]}</span>
        </div>
      )}
      {rule?.freq === 'weekly' && (
        <div className="weekdays" role="group" aria-label="星期">
          {WEEK_ORDER.map((d) => (
            <button
              key={d}
              aria-pressed={rule.byDay?.includes(d) ?? false}
              aria-label={`周${WD[d]}`}
              onClick={() => toggleDay(d)}
            >
              {WD[d]}
            </button>
          ))}
        </div>
      )}
      {rule?.freq === 'monthly' && (
        <>
          <div className="row">
            <span className="help">日期</span>
            <Select<number>
              ariaLabel="每月日期"
              value={rule.monthDay ?? Number(base.slice(8))}
              onChange={(v) => patch({ monthDay: v })}
              options={[
                ...Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: `${i + 1} 日` })),
                { value: -1, label: '最后一天' },
              ]}
            />
          </div>
          <p className="help" style={{ margin: 0 }}>
            当月没有该日期时，落在当月最后一天。
          </p>
        </>
      )}
      {rule && (
        <>
          <div>
            <span className="field-label">结束</span>
            <div className="row">
              <Select<RepeatEnd['type']>
                ariaLabel="结束条件"
                value={rule.end.type}
                onChange={setEnd}
                options={[
                  { value: 'never', label: '永不' },
                  { value: 'until', label: '于某日结束' },
                  { value: 'count', label: '重复若干次' },
                ]}
              />
              {rule.end.type === 'until' && (
                <input
                  type="date"
                  className="input"
                  aria-label="结束日期"
                  min={base}
                  value={rule.end.date}
                  onChange={(e) => e.target.value && patch({ end: { type: 'until', date: e.target.value } })}
                />
              )}
              {rule.end.type === 'count' && (
                <>
                  <input
                    type="number"
                    className="input"
                    style={{ width: 72 }}
                    min={1}
                    max={999}
                    aria-label="重复次数"
                    value={countDraft}
                    onChange={(e) => setCountDraft(Math.min(999, Math.max(1, Number(e.target.value) || 1)))}
                    onBlur={() => patch({ end: { type: 'count', count: countDraft } })}
                  />
                  <span className="help">次</span>
                </>
              )}
            </div>
          </div>
          <div className="summary">{repeatSummary(rule)}</div>
          <div>
            <span className="field-label">接下来 {preview.length} 次</span>
            <ol className="preview-dates">
              {preview.map((d) => (
                <li key={d}>
                  {d}（{weekday(d)}
                  {dayNote(d)}）
                </li>
              ))}
            </ol>
            {(rule.freq === 'weekdays' || rule.freq === 'firstWorkday') && (
              <p className="help" style={{ margin: '6px 0 0' }}>
                按法定节假日与调休计算{years.length ? `（已有 ${years[0]}–${years.at(-1)} 年的安排）` : ''}
                ，没有安排的年份按周一至周五。
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
