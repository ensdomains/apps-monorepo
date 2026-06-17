import { RainbowKitProvider, useConnectModal } from '@rainbow-me/rainbowkit'
import { useMemo } from 'react'
import { WalletUiProvider, type WalletUiValue } from '../wallet-context'
import '@rainbow-me/rainbowkit/styles.css'

const noop = () => {}

// Fills WalletUiContext from RainbowKit's own modal. EOA-only: sign-out needs
// nothing beyond the wagmi disconnect, so `clearSession` is a no-op.
const RainbowKitWalletUi = ({ children }: { children: React.ReactNode }) => {
  const { openConnectModal, connectModalOpen } = useConnectModal()

  const value = useMemo<WalletUiValue>(
    () => ({
      openLogin: openConnectModal ?? noop,
      isOpen: connectModalOpen ?? false,
      clearSession: async () => {},
      isClearingSession: false,
    }),
    [openConnectModal, connectModalOpen],
  )

  return <WalletUiProvider value={value}>{children}</WalletUiProvider>
}

/** Default wallet stack: RainbowKit connect UI over the shared wagmi config. */
const RainbowKitStack = ({ children }: { children: React.ReactNode }) => (
  <RainbowKitProvider>
    <RainbowKitWalletUi>{children}</RainbowKitWalletUi>
  </RainbowKitProvider>
)

export default RainbowKitStack
