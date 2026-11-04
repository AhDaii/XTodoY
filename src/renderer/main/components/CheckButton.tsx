import type { Todo } from '@shared/types';
import { useTodoActions } from '../lib/actions';
import { useUi } from '../lib/store';

const PRIO = ['none', 'low', 'medium', 'high'] as const;

/**
 * 待办前的圆形勾选框（设计系统 §7.1，#24 方案 A"弹性填充"）：按下时轻微缩小，完成时用优先级颜色填满并带回弹，
 * 对勾一笔画出；悬停时预览对勾。列表与详情面板共用。
 */
export function CheckButton({ todo }: { todo: Todo }) {
  const actions = useTodoActions();
  const completing = useUi((s) => s.completing.has(todo.id));
  const checked = todo.status === 'done' || completing;
  return (
    <button
      className={`check prio-${PRIO[todo.priority]} ${completing ? 'is-completing' : ''}`}
      role="checkbox"
      aria-checked={checked}
      aria-label={`完成：${todo.title}`}
      onClick={(e) => {
        e.stopPropagation();
        void actions.toggle(todo);
      }}
    >
      <span className="ring">
        <svg className="tick" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </span>
    </button>
  );
}
