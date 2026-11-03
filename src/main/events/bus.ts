import { EventEmitter } from 'node:events';
import type { TodayCount } from '@shared/ipc';
import type { Settings } from '@shared/types';

/** 主进程内部的领域事件（docs/design/architecture.md §3.5） */
export interface BusEvents {
  'todos.changed': [ids?: string[]];
  'tags.changed': [];
  'settings.changed': [patch: Partial<Settings>];
  'today.count': [count: TodayCount];
  'theme.changed': [dark: boolean];
  'time.jumped': [reason: 'resume' | 'drift' | 'midnight' | 'timezone'];
  'reminders.resumed': [];
}

class TypedBus extends EventEmitter<BusEvents> {}

export const bus = new TypedBus();
