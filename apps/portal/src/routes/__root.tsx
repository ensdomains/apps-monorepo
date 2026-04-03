import {
  TransactionManagerProvider,
  transactionManager,
} from '@ens-apps/transaction-manager'
import { RainbowKitProvider } from '@rainbow-me/rainbowkit'
import { QueryClientProvider } from '@tanstack/react-query'
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { type ReactNode, useEffect } from 'react'
import { Toaster } from 'sonner'
import { sepolia } from 'viem/chains'
import { usePublicClient, WagmiProvider } from 'wagmi'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { useAutoFundOnLowBalance } from '@/hooks/useAutoFundOnLowBalance'
import { PHProvider } from '@/lib/posthog/provider'
import { wagmiConfig } from '@/lib/wagmi'
import { queryClient } from '@/utils/queryClient'

function TransactionManagerSetup({ children }: { children: ReactNode }) {
  const publicClient = usePublicClient({ chainId: sepolia.id })

  useAutoFundOnLowBalance()

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
  staticData: { hideSidebar: true },
  component: () => {
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

        <Toaster position="top-right" richColors duration={4000} />
        <TanStackRouterDevtools />
      </>
    )
  },
  notFoundComponent: () => <NotFoundMessage />,
})
