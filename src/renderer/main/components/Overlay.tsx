import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useUi } from '../lib/store';
import { Icon } from './Icon';

/** 撤销提示条（5 秒），对应 UI-16 */
export function Toast() {
  const toast = useUi((s) => s.toast);
  const hide = useUi((s) => s.hideToast);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(hide, 5000);
    return () => clearTimeout(t);
  }, [toast, hide]);
  if (!toast) return null;
  return (
    <div className="toast-host" aria-live="polite">
      <div className="toast" role="status" key={toast.id}>
        <span className="msg">{toast.message}</span>
        {toast.undo && (
          <button
            onClick={() => {
              toast.undo?.();
              hide();
            }}
          >
            撤销
          </button>
        )}
        <button aria-label="关闭提示" onClick={hide}>
          <Icon name="x" size={14} />
        </button>
      </div>
    </div>
  );
}

/** 模态对话框：Esc / 点击遮罩关闭，打开时焦点落在第一个按钮 */
export function Dialog({ onClose, children, label }: { onClose: () => void; children: ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[data-autofocus], button')?.focus();
  }, []);
  return (
    <div
      className="overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div className="dialog" role="dialog" aria-modal="true" aria-label={label} ref={ref}>
        {children}
      </div>
    </div>
  );
}

/** 锚定在触发元素旁的弹层；优先放在左侧（详情面板在右侧），空间不足时放在下方 */
export function Popover({
  anchor,
  onClose,
  children,
  label,
}: {
  anchor: HTMLElement;
  onClose: () => void;
  children: ReactNode;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = anchor.getBoundingClientRect();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = r.left - w - 8;
    if (left < 8) left = Math.min(r.left, innerWidth - w - 8);
    const top = Math.max(8, Math.min(r.top, innerHeight - h - 8));
    setPos({ left, top });
  }, [anchor, children]);
  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        anchor.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [anchor, onClose]);
  return (
    <div
      ref={ref}
      className="popover"
      role="dialog"
      aria-label={label}
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
    >
      {children}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  text,
  tone,
}: {
  icon: Parameters<typeof Icon>[0]['name'];
  title: string;
  text: string;
  tone?: 'success';
}) {
  return (
    <div className={`empty ${tone ?? ''}`}>
      <div className="badge">
        <Icon name={icon} size={28} />
      </div>
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}
