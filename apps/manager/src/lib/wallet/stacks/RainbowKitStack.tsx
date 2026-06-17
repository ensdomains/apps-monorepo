import {
  RainbowKitProvider,
  useConnectModal as useRainbowConnectModal,
} from '@rainbow-me/rainbowkit'
import { QueryClientProvider } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useDisconnect, WagmiProvider } from 'wagmi'
import { wagmiConfig } from '@/lib/wagmi'
import { WalletUiProvider, type WalletUiValue } from '../WalletUiContext'
import '@rainbow-me/rainbowkit/styles.css'

// Fills WalletUiContext for the RainbowKit stack: RainbowKit's own modal drives
// connect; there's no embedded-wallet sync gap, so ready=true / syncing=false.
const RainbowKitWalletUi = ({ children }: { children: React.ReactNode }) => {
  const { openConnectModal, connectModalOpen } = useRainbowConnectModal()
  const { mutateAsync: disconnectAsync } = useDisconnect()

  // Memoized so the context value is referentially stable across unrelated
  // re-renders (the Provider re-renders all consumers on identity change).
  const value = useMemo<WalletUiValue>(
    () => ({
      openConnectModal,
      connectModalOpen: connectModalOpen ?? false,
      ready: true,
      syncing: false,
      disconnect: async () => {
        await disconnectAsync().catch(() => {})
      },
    }),
    [openConnectModal, connectModalOpen, disconnectAsync],
  )

  return <WalletUiProvider value={value}>{children}</WalletUiProvider>
}

/** Default wallet stack: wagmi + RainbowKit (external EOA wallets). */
export const RainbowKitStack = ({
  queryClient,
  children,
}: {
  queryClient: React.ComponentProps<typeof QueryClientProvider>['client']
  children: React.ReactNode
}) => (
  <WagmiProvider config={wagmiConfig}>
    <QueryClientProvider client={queryClient}>
      <RainbowKitProvider>
        <RainbowKitWalletUi>{children}</RainbowKitWalletUi>
      </RainbowKitProvider>
    </QueryClientProvider>
  </WagmiProvider>
)
