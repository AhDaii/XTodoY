import { EventEmitter } from 'node:events';
import type { TodayCount } from '@shared/ipc';

/** 主进程内部的领域事件（docs/design/architecture.md §3.5） */
export interface BusEvents {
  'todos.changed': [ids?: string[]];
  'today.count': [count: TodayCount];
  'theme.changed': [dark: boolean];
  'time.jumped': [reason: 'resume' | 'drift' | 'midnight'];
}

class TypedBus extends EventEmitter<BusEvents> {}

export const bus = new TypedBus();
