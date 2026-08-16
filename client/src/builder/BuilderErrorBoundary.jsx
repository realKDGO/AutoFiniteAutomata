import React from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';

export class BuilderErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Builder Canvas error caught by boundary:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[300px] p-6 text-center bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400 mb-3">
            <AlertTriangle size={24} />
          </div>
          <h3 className="text-base font-bold text-ink dark:text-ink-dark mb-1">
            Canvas Encountered an Error
          </h3>
          <p className="text-xs text-ink-muted dark:text-ink-darkMuted max-w-md mb-4">
            An unexpected error occurred while rendering the canvas. You can recover without losing your project state.
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary/90 rounded-lg transition focus-ring shadow-sm"
          >
            <RefreshCw size={14} /> Recover Canvas
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default BuilderErrorBoundary;
