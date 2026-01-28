import {
  TransactionManagerProvider,
  transactionManager,
} from '@ens-apps/transaction-manager'
import { RainbowKitProvider } from '@rainbow-me/rainbowkit'
import { QueryClientProvider } from '@tanstack/react-query'
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { type ReactNode, useEffect } from 'react'
import { sepolia } from 'viem/chains'
import { usePublicClient, WagmiProvider } from 'wagmi'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { PasswordModal } from '@/components/PasswordModal'
import { PHProvider } from '@/lib/posthog/provider'
import { wagmiConfig } from '@/lib/wagmi'
import { queryClient } from '@/utils/queryClient'

const hash =
  '0x6337f5f46479e89c07cbe68b81705a654d86277ebf2d47d5bf7d04b7d3fd4c45'

function TransactionManagerSetup({ children }: { children: ReactNode }) {
  const publicClient = usePublicClient({ chainId: sepolia.id })

  useEffect(() => {
    if (publicClient) {
      transactionManager.setPublicClient(sepolia.id, publicClient)
    }
  }, [publicClient])

  if (!publicClient) {
    return <>{children}</>
  }

  return (
    <TransactionManagerProvider publicClient={publicClient}>
      {children}
    </TransactionManagerProvider>
  )
}

export const Route = createRootRoute({
  component: () => {
    const password = localStorage.getItem('pass-hash')

    if (!password || password !== hash) {
      return <PasswordModal />
    }

    return (
      <>
        <WagmiProvider config={wagmiConfig}>
          <QueryClientProvider client={queryClient}>
            <RainbowKitProvider>
              <TransactionManagerSetup>
                <PHProvider>
                  <Outlet />
                </PHProvider>
              </TransactionManagerSetup>
            </RainbowKitProvider>
          </QueryClientProvider>
        </WagmiProvider>

        <TanStackRouterDevtools />
      </>
    )
  },
  notFoundComponent: () => <NotFoundMessage />,
})
