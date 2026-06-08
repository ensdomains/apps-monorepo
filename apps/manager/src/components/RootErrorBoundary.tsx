import { Component, type ReactNode } from 'react'

interface RootErrorBoundaryProps {
  children: ReactNode
}

interface RootErrorBoundaryState {
  hasError: boolean
}

/**
 * Last-resort error boundary around the whole provider tree. A throw during
 * render/commit (e.g. a transient wallet-reconnect race) would otherwise
 * unmount the entire React tree and leave a blank page. This catches it and
 * shows a minimal recovery screen instead.
 *
 * The fallback is intentionally provider-free (plain markup + inline styles)
 * so it still renders even if the failure originated inside a provider.
 */
export class RootErrorBoundary extends Component<
  RootErrorBoundaryProps,
  RootErrorBoundaryState
> {
  state: RootErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): RootErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: unknown, info: unknown) {
    // Surface the real error (the minified prod console only shows the throw).
    console.error('[RootErrorBoundary] caught render error', error, info)
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          minHeight: '100dvh',
          padding: '24px',
          textAlign: 'center',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <p style={{ fontSize: '16px', color: '#2D3648' }}>
          Something went wrong. Please reload the page.
        </p>
        <button
          onClick={() => {
            window.location.reload()
          }}
          style={{
            padding: '8px 20px',
            borderRadius: '8px',
            border: 'none',
            background: '#0066CC',
            color: '#fff',
            fontSize: '14px',
            cursor: 'pointer',
          }}
          type="button"
        >
          Reload
        </button>
      </div>
    )
  }
}
