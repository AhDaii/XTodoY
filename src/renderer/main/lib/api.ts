import type { Result } from '@shared/ipc';

export const api = window.xtodoy;

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** 解包主进程返回的 Result：失败时抛出带中文说明的 ApiError */
export async function call<T>(p: Promise<Result<T>>): Promise<T> {
  const r = await p;
  if (!r.ok) throw new ApiError(r.error.code, r.error.message);
  return r.data;
}
