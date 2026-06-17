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

// RainbowKit's own modal drives connect, and there's no async vendor init, so
// ready/syncing are constant.
const RainbowKitWalletUi = ({ children }: { children: React.ReactNode }) => {
  const { openConnectModal, connectModalOpen } = useRainbowConnectModal()
  const { mutateAsync: disconnectAsync } = useDisconnect()

  // Memoized: the Provider re-renders all consumers when this value's identity changes.
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
