/** 业务错误：code 供渲染进程判断，message 为可直接展示的中文说明 */
export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const invalid = (message: string): AppError => new AppError('INVALID_INPUT', message);
export const notFound = (what: string): AppError => new AppError('NOT_FOUND', `${what}不存在或已被删除`);
