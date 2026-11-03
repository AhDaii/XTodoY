import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * 界面渲染出错时的兜底（NFR-REL-04）：React 19 遇到未捕获的渲染错误会卸载整棵组件树，
 * 窗口只剩一片底色。这里改为显示说明与"重新加载"，错误写入主进程日志（console.error 被转发到 logs/main.log）。
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[renderer] render error', error, info.componentStack);
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash" role="alert">
        <h1>界面出了点问题</h1>
        <p>数据没有受到影响，提醒也会照常进行。重新加载后即可继续使用。</p>
        <p className="help">{this.state.error.message}</p>
        <button className="btn primary" onClick={() => location.reload()}>
          重新加载
        </button>
      </div>
    );
  }
}
