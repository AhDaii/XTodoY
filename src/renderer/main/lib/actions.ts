import { useMemo } from 'react';
import type { Todo } from '@shared/types';
import { api, call } from './api';
import { useReportError } from './data';
import { useUi } from './store';

/** 待办的常用操作：统一处理撤销提示条与错误提示 */
export function useTodoActions() {
  const showToast = useUi((s) => s.showToast);
  const select = useUi((s) => s.select);
  const report = useReportError();
  return useMemo(() => {
    const undoable = (msg: string, token: string) =>
      showToast(msg, () => void call(api.todos.undo(token)).catch(report));
    return {
      toggle: (t: Todo) =>
        call(api.todos.toggle(t.id))
          .then(({ todo, undoToken }) =>
            undoable(todo.status === 'done' ? `已完成"${t.title}"` : '已恢复为未完成', undoToken),
          )
          .catch(report),
      remove: (t: Todo) =>
        call(api.todos.remove(t.id))
          .then(({ undoToken }) => {
            if (useUi.getState().selectedId === t.id) select(null);
            undoable(`已删除"${t.title}"`, undoToken);
          })
          .catch(report),
      restore: (t: Todo) =>
        call(api.todos.restore(t.id))
          .then(() => showToast(`已恢复"${t.title}"`))
          .catch(report),
      purge: (t: Todo) => call(api.todos.purge(t.id)).catch(report),
    };
  }, [showToast, select, report]);
}
