import { randomUUID } from 'node:crypto';
import { LIMITS } from '@shared/types';

/**
 * 撤销令牌：完成 / 删除等操作返回令牌，界面在提示条显示期间（5 秒）可撤销。
 * 令牌在内存中保存稍长一点（10 秒）以覆盖界面延迟，过期自动清理。
 */
export class UndoStore {
  private readonly items = new Map<string, { expires: number; run: () => void }>();

  constructor(private readonly ttlMs = LIMITS.undoMs * 2) {}

  add(run: () => void): string {
    this.prune();
    const token = randomUUID();
    this.items.set(token, { expires: Date.now() + this.ttlMs, run });
    return token;
  }

  /** 执行撤销；令牌不存在或已过期返回 false */
  undo(token: string): boolean {
    const item = this.items.get(token);
    this.items.delete(token);
    if (!item || item.expires < Date.now()) return false;
    item.run();
    return true;
  }

  private prune(): void {
    const now = Date.now();
    for (const [k, v] of this.items) if (v.expires < now) this.items.delete(k);
  }
}
