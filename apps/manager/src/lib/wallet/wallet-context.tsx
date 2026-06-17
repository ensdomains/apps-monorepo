import { createContext, useContext } from 'react'

export type WalletUiValue = {
  /** Open the connect/login UI (RainbowKit modal, or the Privy social dialog). */
  openLogin: () => void
  isOpen: boolean
  /**
   * Vendor session teardown beyond wagmi's disconnect — Privy `logout()`, or a
   * no-op for an external wallet. `useSignOut` composes this with the wagmi
   * disconnect so sign-out is a single canonical path.
   */
  clearSession: () => Promise<void>
  isClearingSession: boolean
}

const DEFAULT: WalletUiValue = {
  openLogin: () => {},
  isOpen: false,
  clearSession: async () => {},
  isClearingSession: false,
}

const WalletUiContext = createContext<WalletUiValue>(DEFAULT)

export const WalletUiProvider = WalletUiContext.Provider

export const useWalletUi = () => useContext(WalletUiContext)

/**
 * The connect-UI seam used across the app (RainbowKit's `useConnectModal`
 * equivalent). Vendor-agnostic — the active wallet stack fills it.
 */
export const useLoginModal = () => {
  const { openLogin, isOpen } = useWalletUi()
  return { openLogin, isOpen }
}
