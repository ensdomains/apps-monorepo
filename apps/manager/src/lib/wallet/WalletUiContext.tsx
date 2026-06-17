import { createContext, useContext } from 'react'

/**
 * Vendor-agnostic wallet UI state. Each wallet stack (RainbowKit or Privy) fills
 * this in; the rest of the app reads it without knowing which vendor is active.
 * This is the seam that lets the `privy-login` flag switch vendors without
 * touching app code.
 */
export type WalletUiValue = {
  /** Open the connect/login UI. Undefined when already connected / not ready. */
  openConnectModal: (() => void) | undefined
  /** A connect/login flow is in flight (disable triggers, show loading). */
  connectModalOpen: boolean
  /** The wallet layer has resolved its initial state (Privy ready / hydrated). */
  ready: boolean
  /** Connection is in flight beyond wagmi's own flags (e.g. the Privy→wagmi gap). */
  syncing: boolean
  /** Full sign-out: clears wagmi and, in the Privy stack, the Privy session too. */
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

/** Full wallet UI state (connection-aware UI like the Header). */
export const useWalletUi = () => useContext(WalletUiContext)

/**
 * Drop-in replacement for RainbowKit's `useConnectModal`, vendor-agnostic: reads
 * the active stack's connect handler from WalletUiContext. Call sites unchanged.
 */
export const useConnectModal = () => {
  const { openConnectModal, connectModalOpen } = useWalletUi()
  return { openConnectModal, connectModalOpen }
}
