import React from 'react';
import * as Sentry from '@sentry/react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    Sentry.captureException(error, {
      contexts: { react: { componentStack: info.componentStack } },
    });
  }

  handleReset = () => {
    this.props.onReset?.();
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const msg = String(this.state.error?.message || '');
      const isChunkError =
        msg.includes('Failed to fetch dynamically imported module') ||
        this.state.error?.name === 'ChunkLoadError' ||
        msg.includes('Loading chunk') ||
        msg.includes('Importing a module script failed') ||
        // Vite dev trả 504 khi browser fetch optimized dep (vd. qrcode-generator)
        // bằng hash cũ trong lúc optimizer re-bundle ("Outdated Optimize Dep").
        // lazyWithRetry đã retry, tới đây là stale/deploy thật → cho reload.
        msg.includes('Outdated Optimize Dep') ||
        msg.includes('Failed to fetch');

      return (
        <div className="flex flex-col items-center justify-center min-h-[300px] p-10 text-center text-text-secondary">
          <div className="w-12 h-12 rounded-full bg-parish-danger-bg flex items-center justify-center mb-4 text-2xl">
            ⚠️
          </div>
          <h3 className="text-base font-bold text-parish-danger m-0 mb-2">
            {isChunkError ? 'Phiên bản ứng dụng đã được cập nhật' : 'Có lỗi xảy ra'}
          </h3>
          <p className="text-[13px] m-0 mb-4 max-w-[400px]">
            {isChunkError
              ? 'Tài nguyên trang web vừa được làm mới trên máy chủ. Vui lòng tải lại trang để áp dụng phiên bản mới nhất.'
              : import.meta.env.DEV && this.state.error?.message
              ? this.state.error.message
              : 'Một lỗi không mong muốn đã xảy ra. Vui lòng thử lại.'}
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={this.handleReset}
              className="btn btn-secondary text-[13px] px-4 py-2 rounded-lg"
            >
              Thử lại
            </button>
            {isChunkError && (
              <button
                onClick={() => window.location.reload()}
                className="btn btn-primary text-[13px] px-4 py-2 rounded-lg"
              >
                Tải lại trang
              </button>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
