import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import { useConnection } from 'wagmi'
import { ConnectWalletDialog } from './ConnectWalletDialog'
import {
  type ConnectContinuationResult,
  connectContinuationReducer,
  INITIAL_CONNECT_CONTINUATION,
} from './connectContinuation'

export type OpenConnectModalOptions = {
  readonly onResult?: (result: ConnectContinuationResult) => void
}

type ConnectModalContextValue = {
  /** Open the wallet-selection modal. */
  readonly openConnectModal: (options?: OpenConnectModalOptions) => void
  /** Cancel the continuation without changing the wallet chooser or connection. */
  readonly cancelConnectContinuation: () => void
  /** Whether the modal is currently open. */
  readonly connectModalOpen: boolean
  /** Includes the chooser and external connector UI until the attempt settles. */
  readonly isConnectFlowActive: boolean
}

const ConnectModalContext = createContext<ConnectModalContextValue | null>(null)

// Stable no-op used when the provider isn't in the tree. In normal operation
// `ConnectModalProvider` is mounted at the app root, so this only surfaces
// after a hot-reload invalidates the context module (cleared by a page
// reload). Degrade gracefully rather than crash the whole route:
// `useConnectModal` no-ops outside its provider.
const NOOP_CONNECT_MODAL: ConnectModalContextValue = {
  openConnectModal: () => {},
  cancelConnectContinuation: () => {},
  connectModalOpen: false,
  isConnectFlowActive: false,
}

const useConnectContinuation = (isConnected: boolean) => {
  const [open, setOpen] = useState(false)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [continuation, dispatch] = useReducer(
    connectContinuationReducer,
    INITIAL_CONNECT_CONTINUATION,
  )
  const sequence = useRef(0)
  const callback = useRef<{
    readonly requestId: number
    readonly onResult: (result: ConnectContinuationResult) => void
  } | null>(null)
  const requestId =
    continuation.status === 'idle' ? null : continuation.requestId

  const openConnectModal = useCallback(
    (options?: OpenConnectModalOptions) => {
      if (options?.onResult) {
        const id = sequence.current + 1
        sequence.current = id
        callback.current = { requestId: id, onResult: options.onResult }
        dispatch({
          type: 'open',
          requestId: id,
          hasPendingAttempt: pendingId !== null,
        })
      }
      setOpen(true)
    },
    [pendingId],
  )

  const cancelConnectContinuation = useCallback(() => {
    callback.current = null
    dispatch({ type: 'reset' })
  }, [])

  // Eager connections close the chooser, but pending connector UI must settle before continuation.
  useEffect(() => {
    if (!isConnected) return
    setOpen(false)
    if (requestId !== null) dispatch({ type: 'connected', requestId })
  }, [isConnected, requestId])

  useEffect(() => {
    if (continuation.status !== 'ready' || pendingId !== null) return
    const current = callback.current
    if (current?.requestId !== continuation.requestId) return
    callback.current = null
    dispatch({ type: 'reset' })
    current.onResult(continuation.result)
  }, [continuation, pendingId])

  const onOpenChange = useCallback(
    (next: boolean, reason?: 'external-modal' | 'connected') => {
      setOpen(next)
      if (requestId === null) return
      if (next) dispatch({ type: 'surface-opened', requestId })
      else if (!reason) dispatch({ type: 'dismissed', requestId })
    },
    [requestId],
  )

  const onAttemptStart = useCallback(() => {
    const current = callback.current
    if (current)
      dispatch({ type: 'attempt-started', requestId: current.requestId })
  }, [])

  const onAttemptEnd = useCallback(
    (result: 'connected' | 'cancelled' | 'failed') => {
      const current = callback.current
      if (!current) return
      if (result === 'cancelled') setOpen(false)
      const type = {
        connected: 'attempt-succeeded',
        cancelled: 'dismissed',
        failed: 'attempt-failed',
      } as const
      dispatch({ type: type[result], requestId: current.requestId })
    },
    [],
  )

  const onCloseAutoFocus = useCallback(
    (event: Event) => {
      if (requestId === null) return
      if (callback.current?.requestId === requestId) event.preventDefault()
      dispatch({ type: 'surface-closed', requestId })
    },
    [requestId],
  )

  return {
    open,
    pendingId,
    setPendingId,
    openConnectModal,
    cancelConnectContinuation,
    onOpenChange,
    onAttemptStart,
    onAttemptEnd,
    onCloseAutoFocus,
  }
}

/** Mount once near the application root, inside WagmiProvider. */
export const ConnectModalProvider = ({
  children,
}: {
  readonly children: ReactNode
}) => {
  const { isConnected } = useConnection()
  const continuation = useConnectContinuation(isConnected)
  const { openConnectModal, cancelConnectContinuation, open, pendingId } =
    continuation

  const value = useMemo(
    () => ({
      openConnectModal,
      cancelConnectContinuation,
      connectModalOpen: open,
      isConnectFlowActive: open || pendingId !== null,
    }),
    [openConnectModal, cancelConnectContinuation, open, pendingId],
  )

  return (
    <ConnectModalContext.Provider value={value}>
      {children}
      <ConnectWalletDialog
        open={open}
        pendingId={pendingId}
        onPendingIdChange={continuation.setPendingId}
        onOpenChange={continuation.onOpenChange}
        onAttemptStart={continuation.onAttemptStart}
        onAttemptEnd={continuation.onAttemptEnd}
        onCloseAutoFocus={continuation.onCloseAutoFocus}
      />
    </ConnectModalContext.Provider>
  )
}

export const useConnectModal = (): ConnectModalContextValue => {
  const context = useContext(ConnectModalContext)
  if (!context) {
    if (import.meta.env.DEV) {
      console.warn(
        'useConnectModal: no ConnectModalProvider found. This is usually a ' +
          'stale hot-reload boundary — reload the page. If it persists after ' +
          'a reload, a consumer is rendering outside ConnectModalProvider.',
      )
    }
    return NOOP_CONNECT_MODAL
  }
  return context
}
