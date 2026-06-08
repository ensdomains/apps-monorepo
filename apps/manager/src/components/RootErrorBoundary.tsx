import { Trans } from '@lingui/react/macro'
import { Component, type ReactNode } from 'react'

const MAX_AUTO_RETRIES = 3
const RETRY_DELAY_MS = 150

interface RootErrorBoundaryProps {
  children: ReactNode
}

interface RootErrorBoundaryState {
  hasError: boolean
  retryCount: number
}

/**
 * Auto-recovers transient render races — notably the TanStack Router
 * match-state race where `MatchInnerImpl` throws `undefined` for a briefly
 * pending match during the connect → smart-account re-render window. It
 * re-renders a few times (recovering once the router settles) and only shows
 * a manual reload screen if the error persists. Removing it reintroduces a
 * blank page, so it stays.
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

    // Unobtrusive placeholder while auto-retrying.
    if (this.state.retryCount < MAX_AUTO_RETRIES) {
      return <div aria-busy="true" className="min-h-dvh bg-[#FCFBFB]" />
    }

    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-base text-foreground">
          <Trans>Something went wrong. Please reload the page.</Trans>
        </p>
        <button
          className="rounded-lg bg-ens-blue px-5 py-2 font-medium text-sm text-white hover:bg-ens-blue-hover"
          onClick={() => {
            window.location.reload()
          }}
          type="button"
        >
          <Trans>Reload</Trans>
        </button>
      </div>
    )
  }
}
