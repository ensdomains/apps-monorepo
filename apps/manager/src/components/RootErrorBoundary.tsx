import { Component, type ReactNode } from 'react'

interface RootErrorBoundaryProps {
  children: ReactNode
}

interface RootErrorBoundaryState {
  hasError: boolean
  retryCount: number
}

// Transient errors — notably a TanStack Router match-state race where
// `MatchInnerImpl` throws `undefined` for a match that is briefly pending
// without its load promise, during the connect → smart-account re-render
// window — recover on a clean re-render once the router settles. Auto-retry a
// few times before showing the manual recovery screen.
const MAX_AUTO_RETRIES = 3
const RETRY_DELAY_MS = 150

/**
 * Last-resort error boundary around the whole provider/router tree.
 *
 * Without it, a throw during render/commit (e.g. the router race above)
 * unmounts the entire React tree and leaves a blank page. This catches it,
 * auto-retries a few re-renders (which recover transient router/reconnect
 * races — verified: removing this boundary reintroduces the blank page),
 * and only shows a manual "reload" screen if the error keeps recurring.
 *
 * The fallback is intentionally provider-free (plain markup + inline styles)
 * so it still renders even if the failure originated inside a provider.
 */
export class RootErrorBoundary extends Component<
  RootErrorBoundaryProps,
  RootErrorBoundaryState
> {
  state: RootErrorBoundaryState = { hasError: false, retryCount: 0 }
  private retryTimer: ReturnType<typeof setTimeout> | undefined

  static getDerivedStateFromError(): Partial<RootErrorBoundaryState> {
    return { hasError: true }
  }

  componentDidCatch(error: unknown, info: unknown) {
    console.error('[RootErrorBoundary] caught render error', error, info)

    if (this.state.retryCount < MAX_AUTO_RETRIES) {
      this.retryTimer = setTimeout(() => {
        this.setState((prev) => ({
          hasError: false,
          retryCount: prev.retryCount + 1,
        }))
      }, RETRY_DELAY_MS)
    }
  }

  componentWillUnmount() {
    if (this.retryTimer) clearTimeout(this.retryTimer)
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    // Auto-retrying: render an unobtrusive placeholder while the tree
    // re-renders and the router/connection settles.
    if (this.state.retryCount < MAX_AUTO_RETRIES) {
      return (
        <div
          aria-busy="true"
          style={{ minHeight: '100dvh', background: '#FCFBFB' }}
        />
      )
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
