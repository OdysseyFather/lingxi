import { Component } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

export class CodingErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex items-center justify-center bg-[var(--coding-surface,#faf8f5)] p-8">
          <div className="max-w-md text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto">
              <AlertTriangle size={28} className="text-red-500" />
            </div>
            <h2 className="text-lg font-semibold text-[var(--text,#1a1a1a)]">
              {this.props.title || 'Coding View 发生错误'}
            </h2>
            <p className="text-sm text-[var(--text-soft,#666)] leading-relaxed">
              该模块遇到了意外错误，但不会影响灵犀主模式的正常使用。
            </p>
            {this.state.error && (
              <pre className="mt-3 p-3 bg-red-50 rounded-lg text-xs text-red-700 text-left overflow-auto max-h-32">
                {this.state.error.message || String(this.state.error)}
              </pre>
            )}
            <button
              onClick={this.handleReset}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent,#c4a882)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <RotateCcw size={14} />
              重试
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
