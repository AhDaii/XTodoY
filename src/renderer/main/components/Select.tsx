import * as RS from '@radix-ui/react-select';
import { Icon } from './Icon';

export interface SelectOption<V extends string | number> {
  value: V;
  label: string;
  /** 选项下方的辅助说明（可选） */
  hint?: string;
}

interface Props<V extends string | number> {
  value: V;
  options: SelectOption<V>[];
  onChange(value: V): void;
  /** 无可见标签时必须提供，供读屏使用 */
  ariaLabel: string;
  id?: string;
  disabled?: boolean;
  width?: number | string;
}

/**
 * 下拉选择（设计系统 §7.9）：替代原生 <select>，展开后的列表与界面主题一致。
 * 基于 Radix Select，自带键盘操作（方向键、Home/End、首字母跳转、Enter、Esc）与读屏语义。
 */
export function Select<V extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
  id,
  disabled,
  width,
}: Props<V>) {
  const byKey = new Map(options.map((o) => [String(o.value), o.value]));
  return (
    <RS.Root value={String(value)} onValueChange={(k) => onChange(byKey.get(k)!)} disabled={disabled}>
      <RS.Trigger className="select-trigger" aria-label={ariaLabel} id={id} style={{ width }}>
        <RS.Value />
        <RS.Icon className="select-chevron">
          <Icon name="chevronDown" size={14} />
        </RS.Icon>
      </RS.Trigger>
      <RS.Portal>
        <RS.Content className="select-content" position="popper" sideOffset={4} collisionPadding={8}>
          <RS.Viewport className="select-viewport">
            {options.map((o) => (
              <RS.Item key={String(o.value)} value={String(o.value)} className="select-item">
                <RS.ItemIndicator className="select-check">
                  <Icon name="check" size={14} />
                </RS.ItemIndicator>
                <div className="select-text">
                  <RS.ItemText>{o.label}</RS.ItemText>
                  {o.hint && <span className="select-hint">{o.hint}</span>}
                </div>
              </RS.Item>
            ))}
          </RS.Viewport>
        </RS.Content>
      </RS.Portal>
    </RS.Root>
  );
}
