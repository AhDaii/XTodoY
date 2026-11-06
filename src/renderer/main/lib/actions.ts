import { useMemo } from 'react';
import type { Todo } from '@shared/types';
import { api, call } from './api';
import { useReportError } from './data';
import { friendlyDate, today } from './dates';
import { playSound } from './sounds';
import { useUi } from './store';

/** 勾选动画时长：圆圈填色 + 对勾画出（设计系统 §7.1，#24 方案 A） */
const COMPLETE_ANIMATION_MS = 260;

/** 待办的常用操作：统一处理撤销提示条与错误提示 */
export function useTodoActions() {
  const showToast = useUi((s) => s.showToast);
  const select = useUi((s) => s.select);
  const setCompleting = useUi((s) => s.setCompleting);
  const report = useReportError();
  return useMemo(() => {
    const undoable = (msg: string, token: string) =>
      showToast(msg, () => {
        playSound('undo');
        void call(api.todos.undo(token)).catch(report);
      });
    /** 完成音效（#37）：今天到期的最后一项完成时播放"全部完成" */
    const completeSound = (t: Todo) => {
      if (t.dueDate !== today()) return playSound('done');
      void call(api.todos.counts()).then(
        (c) => playSound(c.today <= 1 ? 'all' : 'done'),
        () => playSound('done'),
      );
    };
    return {
      toggle: async (t: Todo) => {
        // 完成：先播放勾选动画再提交（#24）；取消完成、减少动画时立即提交
        const animate = t.status === 'open' && !matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (useUi.getState().completing.has(t.id)) return; // 动画进行中的重复点击
        if (t.status === 'open') completeSound(t);
        else playSound('undo');
        if (animate) {
          setCompleting(t.id, true);
          await new Promise((r) => setTimeout(r, COMPLETE_ANIMATION_MS));
        }
        return call(api.todos.toggle(t.id))
          .then(({ todo, undoToken }) =>
            undoable(
              t.rrule && t.status === 'open'
                ? todo.status === 'done'
                  ? `已完成"${t.title}"的最后一次`
                  : `已完成本次，下一次：${friendlyDate(todo.dueDate!)}`
                : todo.status === 'done'
                  ? `已完成"${t.title}"`
                  : '已恢复为未完成',
              undoToken,
            ),
          )
          .catch(report)
          .finally(() => animate && setCompleting(t.id, false));
      },
      remove: (t: Todo) =>
        call(api.todos.remove(t.id))
          .then(({ undoToken }) => {
            playSound('del');
            if (useUi.getState().selectedId === t.id) select(null);
            undoable(`已删除"${t.title}"`, undoToken);
          })
          .catch(report),
      restore: (t: Todo) =>
        call(api.todos.restore(t.id))
          .then(() => showToast(`已恢复"${t.title}"`))
          .catch(report),
      purge: (t: Todo) => call(api.todos.purge(t.id)).catch(report),
      skip: (t: Todo) =>
        call(api.todos.skip(t.id))
          .then(({ todo, undoToken }) => undoable(`已跳过本次，下一次：${friendlyDate(todo.dueDate!)}`, undoToken))
          .catch(report),
    };
  }, [showToast, select, report, setCompleting]);
}
