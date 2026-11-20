import { createContext, useContext } from 'react'

type ConnectModalContextValue = {
  readonly openConnectModal: () => void
  readonly connectModalOpen: boolean
}

export const ConnectModalContext =
  createContext<ConnectModalContextValue | null>(null)

// Preserve the no-op fallback during hot reloads that invalidate the provider context.
const NOOP_CONNECT_MODAL: ConnectModalContextValue = {
  openConnectModal: () => {},
  connectModalOpen: false,
}

export const useConnectModal = (): ConnectModalContextValue => {
  const context = useContext(ConnectModalContext)
  if (!context) {
    if (import.meta.env.DEV) {
      console.warn(
        'useConnectModal: no WalletConnectionProvider found. This is ' +
          'usually a stale hot-reload boundary — reload the page. If it ' +
          'persists, a consumer is rendering outside WalletConnectionProvider.',
      )
    }
    return NOOP_CONNECT_MODAL
  }
  return context
}
