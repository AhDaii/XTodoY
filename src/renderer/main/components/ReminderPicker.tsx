import { useState } from 'react';
import { ALL_DAY_PRESETS, REMINDER_PRESETS, reminderLabel } from '@shared/reminders';
import { LIMITS, type ReminderSpec, type Todo } from '@shared/types';
import { api, call } from '../lib/api';
import { useReportError } from '../lib/data';
import { Icon } from './Icon';
import { Select } from './Select';

const UNITS = [
  { value: 1, label: '分钟' },
  { value: 60, label: '小时' },
  { value: 1440, label: '天' },
];
const key = (r: ReminderSpec): string => (r.kind === 'absolute' ? `a${r.at}` : `r${r.offsetMinutes}`);

/** 提醒设置（UI-05，FR-REM-01）：预设、自定义提前量、指定时刻；最多 5 个 */
export function ReminderPicker({
  todo,
  allDayTime,
  onChange,
}: {
  todo: Todo;
  allDayTime: string;
  onChange(t: Todo): void;
}) {
  const report = useReportError();
  const [amount, setAmount] = useState(10);
  const [unit, setUnit] = useState(1);
  const [at, setAt] = useState('');
  const specs = todo.reminders.map((r) => r.spec);
  const allDay = !todo.dueTime;
  const full = specs.length >= LIMITS.remindersPerTodo;

  const save = (next: ReminderSpec[]) => call(api.todos.setReminders(todo.id, next)).then(onChange).catch(report);
  const has = (s: ReminderSpec) => specs.some((x) => key(x) === key(s));
  const toggle = (s: ReminderSpec, on: boolean) => save(on ? [...specs, s] : specs.filter((x) => key(x) !== key(s)));
  const presets = (allDay ? ALL_DAY_PRESETS : REMINDER_PRESETS).map(
    (m) => ({ kind: 'relative', offsetMinutes: m }) as const,
  );
  const custom = specs.filter((s) => !presets.some((p) => key(p) === key(s)));

  return (
    <div className="stack" style={{ width: 288 }}>
      <h3>
        提醒 <span className="help">（最多 {LIMITS.remindersPerTodo} 个）</span>
      </h3>
      {todo.dueDate ? (
        <div>
          {presets.map((p) => (
            <label key={key(p)} className="check-row">
              <input
                type="checkbox"
                checked={has(p)}
                disabled={!has(p) && full}
                onChange={(e) => void toggle(p, e.target.checked)}
              />
              {reminderLabel(p, allDay, allDayTime)}
            </label>
          ))}
        </div>
      ) : (
        <p className="help" style={{ margin: 0 }}>
          设置截止日期后可以添加"准时""提前 N 分钟"等提醒。
        </p>
      )}
      {custom.length > 0 && (
        <div className="reminder-list">
          {custom.map((s) => (
            <span key={key(s)} className="chip">
              <span>{reminderLabel(s, allDay, allDayTime)}</span>
              <button
                aria-label={`删除提醒 ${reminderLabel(s, allDay, allDayTime)}`}
                onClick={() => void toggle(s, false)}
              >
                <Icon name="x" size={10} />
              </button>
            </span>
          ))}
        </div>
      )}
      {todo.dueDate && (
        <div className="row">
          <span className="help">提前</span>
          <input
            type="number"
            className="input"
            style={{ width: 64 }}
            min={1}
            max={999}
            aria-label="提前量"
            value={amount}
            onChange={(e) => setAmount(Math.max(1, Number(e.target.value) || 1))}
          />
          <Select<number> ariaLabel="单位" value={unit} options={UNITS} onChange={setUnit} />
          <button
            className="btn sm"
            disabled={full || has({ kind: 'relative', offsetMinutes: amount * unit })}
            onClick={() => void toggle({ kind: 'relative', offsetMinutes: Math.min(amount * unit, 43_200) }, true)}
          >
            添加
          </button>
        </div>
      )}
      <div className="row">
        <span className="help">指定</span>
        <input
          type="datetime-local"
          className="input"
          aria-label="指定提醒时刻"
          value={at}
          onChange={(e) => setAt(e.target.value)}
        />
        <button
          className="btn sm"
          disabled={!at || full}
          onClick={() => {
            void toggle({ kind: 'absolute', at: new Date(at).getTime() }, true);
            setAt('');
          }}
        >
          添加
        </button>
      </div>
      <p className="help" style={{ margin: 0 }}>
        {allDay && todo.dueDate ? `全天事项在 ${allDayTime} 提醒，可在设置中修改。` : ''}
        提醒通过系统通知推送，可直接「完成」或「稍后提醒」。
      </p>
    </div>
  );
}
