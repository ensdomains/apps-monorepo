import { createContext, useContext } from 'react'

// Vendor-agnostic wallet UI state: the active stack fills this in, the app reads
// it through the hooks below. The seam that lets a second vendor (Privy) drop in
// without touching app code.
export type WalletUiValue = {
  openConnectModal: (() => void) | undefined
  connectModalOpen: boolean
  // Vendor init resolved — always true for RainbowKit; the Privy SDK loads async.
  ready: boolean
  // Connecting beyond wagmi's own flags, e.g. the Privy→wagmi bridge gap.
  syncing: boolean
  // Clears wagmi, plus the Privy session in that stack.
  disconnect: () => Promise<void>
}

const DEFAULT: WalletUiValue = {
  openConnectModal: undefined,
  connectModalOpen: false,
  ready: true,
  syncing: false,
  disconnect: async () => {},
}

const WalletUiContext = createContext<WalletUiValue>(DEFAULT)

export const WalletUiProvider = WalletUiContext.Provider

export const useWalletUi = () => useContext(WalletUiContext)

// Vendor-agnostic stand-in for RainbowKit's useConnectModal.
export const useConnectModal = () => {
  const { openConnectModal, connectModalOpen } = useWalletUi()
  return { openConnectModal, connectModalOpen }
}
