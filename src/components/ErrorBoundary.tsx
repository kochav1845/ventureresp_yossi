import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });
  }

  private handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      const isConnectionError =
        this.state.error?.message?.includes('timeout') ||
        this.state.error?.message?.includes('fetch') ||
        this.state.error?.message?.includes('network') ||
        this.state.error?.message?.includes('Connection terminated');

      return (
        <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-red-50 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl">
            <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
              <div className="bg-gradient-to-r from-red-600 to-orange-600 p-8 text-white">
                <div className="flex items-center justify-center gap-4">
                  <AlertCircle size={48} />
                  <h1 className="text-3xl font-bold">Something Went Wrong</h1>
                </div>
              </div>

              <div className="p-8">
                {isConnectionError ? (
                  <>
                    <div className="mb-6">
                      <h2 className="text-xl font-semibold text-gray-900 mb-3">
                        Connection Issue Detected
                      </h2>
                      <p className="text-gray-700 mb-4">
                        The application is having trouble connecting to the database. This typically happens in preview environments with network restrictions.
                      </p>
                    </div>

                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
                      <h3 className="text-lg font-semibold text-blue-900 mb-3">
                        Quick Fixes:
                      </h3>
                      <ol className="list-decimal list-inside space-y-2 text-blue-800">
                        <li className="font-medium">
                          Refresh the page (Ctrl+R or Cmd+R)
                        </li>
                        <li>Open the preview in a new browser tab</li>
                        <li>
                          Visit{' '}
                          <a
                            href="/connection-test"
                            className="underline font-semibold hover:text-blue-600"
                          >
                            /connection-test
                          </a>{' '}
                          to diagnose the issue
                        </li>
                        <li>
                          Download and run locally with{' '}
                          <code className="bg-blue-100 px-2 py-0.5 rounded">npm run dev</code>
                        </li>
                      </ol>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="mb-6">
                      <h2 className="text-xl font-semibold text-gray-900 mb-3">
                        Unexpected Error
                      </h2>
                      <p className="text-gray-700 mb-4">
                        An unexpected error occurred. Please try refreshing the page.
                      </p>
                    </div>

                    <div className="bg-gray-100 border border-gray-200 rounded-lg p-4 mb-6">
                      <p className="text-sm font-mono text-gray-700 break-all">
                        {this.state.error?.message || 'Unknown error'}
                      </p>
                    </div>
                  </>
                )}

                <div className="flex gap-4">
                  <button
                    onClick={() => window.location.reload()}
                    className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 text-white px-6 py-3 rounded-lg font-semibold hover:from-blue-700 hover:to-cyan-700 transition-all flex items-center justify-center gap-2"
                  >
                    <RefreshCw size={20} />
                    Refresh Page
                  </button>
                  <button
                    onClick={this.handleReset}
                    className="flex-1 bg-gray-200 text-gray-700 px-6 py-3 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
                  >
                    Go to Home
                  </button>
                </div>

                {window.location.hostname.includes('webcontainer') && (
                  <div className="mt-6 pt-6 border-t border-gray-200">
                    <p className="text-xs text-gray-600">
                      <strong>Note:</strong> You're running in a WebContainer preview environment, which has known network limitations. These issues won't occur when deployed or run locally.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
