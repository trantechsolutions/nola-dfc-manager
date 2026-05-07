import { Component } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const { fallback } = this.props;
    if (fallback) return fallback(this.state.error, this.handleReset);

    return (
      <div className="flex flex-col items-center justify-center min-h-[200px] p-8 text-center gap-4">
        <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-full">
          <AlertTriangle size={24} className="text-red-600 dark:text-red-400" />
        </div>
        <div>
          <p className="font-black text-slate-800 dark:text-white text-sm">Something went wrong</p>
          <p className="text-xs text-slate-400 mt-1 max-w-xs">
            {this.state.error?.message || 'An unexpected error occurred in this section.'}
          </p>
        </div>
        <button
          onClick={this.handleReset}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
        >
          <RefreshCw size={12} /> Try again
        </button>
      </div>
    );
  }
}
