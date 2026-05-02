import { Component } from 'react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info);
    this.setState({ info });
  }
  reset = () => this.setState({ error: null, info: null });
  render() {
    if (this.state.error) {
      return (
        <div className="p-6 max-w-2xl mx-auto">
          <div className="surface p-6">
            <div className="text-lg font-semibold text-red-500 mb-2">界面渲染出错</div>
            <div className="text-sm text-[color:var(--text-soft)] mb-3">
              错误已被捕获，可点击下方按钮恢复。
            </div>
            <pre className="text-xs font-mono whitespace-pre-wrap bg-[color:var(--bg-soft)] p-3 rounded-lg overflow-auto max-h-64">
              {String(this.state.error?.stack || this.state.error?.message || this.state.error)}
            </pre>
            <div className="mt-3 flex gap-2">
              <button
                onClick={this.reset}
                className="px-3 py-1.5 rounded-lg bg-[color:var(--accent)] text-white text-sm"
              >重试</button>
              <button
                onClick={() => location.reload()}
                className="px-3 py-1.5 rounded-lg border border-[color:var(--line)] text-sm"
              >刷新页面</button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

