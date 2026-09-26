import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('React Error Boundary caught:', error, info.componentStack);
    this.setState({ errorInfo: info.componentStack });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          background: '#0f172a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif',
          padding: '2rem',
        }}>
          <div style={{
            background: '#1e293b',
            border: '1px solid #ef4444',
            borderRadius: '12px',
            padding: '2rem',
            maxWidth: '640px',
            width: '100%',
          }}>
            <div style={{ color: '#ef4444', fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.75rem' }}>
              Something went wrong
            </div>
            <div style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '1rem' }}>
              {this.state.error?.message}
            </div>
            {this.state.errorInfo && (
              <pre style={{
                background: '#0f172a',
                borderRadius: '8px',
                padding: '1rem',
                fontSize: '0.75rem',
                color: '#64748b',
                overflowX: 'auto',
                maxHeight: '200px',
                overflowY: 'auto',
                marginBottom: '1.5rem',
              }}>
                {this.state.errorInfo}
              </pre>
            )}
            <button
              onClick={() => window.location.reload()}
              style={{
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                padding: '0.6rem 1.25rem',
                cursor: 'pointer',
                fontSize: '0.9rem',
              }}
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
