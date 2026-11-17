import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useReducer,
} from 'react'
import { useConnectionEffect } from 'wagmi'
import {
  type ConnectFlow,
  type ConnectFlowEvent,
  isConnectDialogOpen,
  nextConnectFlow,
} from './connectFlow'

type ConnectModalContextValue = {
  /** Open the wallet-selection modal. */
  openConnectModal: () => void
  /** Whether the modal is currently open. */
  connectModalOpen: boolean
  /** Where a connect started from the dialog has got to. */
  readonly connectFlow: ConnectFlow
  readonly sendConnectFlow: (event: ConnectFlowEvent) => void
}

const ConnectModalContext = createContext<ConnectModalContextValue | null>(null)

// Stable no-op used when the provider isn't in the tree. In normal operation
// `ConnectModalProvider` is mounted by `CustomWalletStack`, so this only
// surfaces after a hot-reload invalidates the context module (cleared by a
// page reload). Degrade gracefully rather than crash the whole route:
// `useConnectModal` no-ops outside its provider.
const NOOP_CONNECT_MODAL: ConnectModalContextValue = {
  openConnectModal: () => {},
  connectModalOpen: false,
  connectFlow: 'closed',
  sendConnectFlow: () => {},
}

// Owns connect-flow state; BackendAuthModal renders the dialog below the smart-account provider.
export const ConnectModalProvider = ({ children }: { children: ReactNode }) => {
  const [connectFlow, sendConnectFlow] = useReducer(nextConnectFlow, 'closed')
  const openConnectModal = useCallback(() => sendConnectFlow('opened'), [])

  // Subscribe to connections, eager reconnects and disconnects.
  const onConnect = useCallback(
    ({ isReconnected }: { readonly isReconnected: boolean }) =>
      sendConnectFlow(isReconnected ? 'reconnected' : 'connected'),
    [],
  )
  const onDisconnect = useCallback(() => sendConnectFlow('disconnected'), [])
  useConnectionEffect({ onConnect, onDisconnect })

  const value = useMemo(
    () => ({
      openConnectModal,
      connectModalOpen: isConnectDialogOpen(connectFlow),
      connectFlow,
      sendConnectFlow,
    }),
    [openConnectModal, connectFlow],
  )

  return (
    <ConnectModalContext.Provider value={value}>
      {children}
    </ConnectModalContext.Provider>
  )
}

export const useCustomConnectModal = (): ConnectModalContextValue => {
  const context = useContext(ConnectModalContext)
  if (!context) {
    if (import.meta.env.DEV) {
      console.warn(
        'useCustomConnectModal: no ConnectModalProvider found. This is ' +
          'usually a stale hot-reload boundary — reload the page. If it ' +
          'persists, a consumer is rendering outside CustomWalletStack.',
      )
    }
    return NOOP_CONNECT_MODAL
  }
  return context
}
