import { DevDrawer } from '@ens-apps/dev-tools'
import {
  TransactionManagerProvider,
  transactionManager,
} from '@ens-apps/transaction-manager'
import { QueryClientProvider } from '@tanstack/react-query'
import { createRootRoute, HeadContent, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { type ReactNode, useEffect } from 'react'
import { Toaster } from 'sonner'
import { usePublicClient, WagmiProvider } from 'wagmi'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { useTransactionModalRouteReset } from '@/features/transaction-manager/hooks/useTransactionModal'
import { ConnectModalProvider } from '@/features/wallet/ConnectModalProvider'
import { MockWalletAutoConnect } from '@/features/wallet/MockWalletAutoConnect'
import { useAutoFundOnLowBalance } from '@/hooks/useAutoFundOnLowBalance'
import { isMockWalletEnabled } from '@/lib/mockWallet.mock'
import { PHProvider } from '@/lib/posthog/provider'
import { sepoliaWithEns, wagmiConfig } from '@/lib/wagmi'
import { getPageTitle } from '@/utils/pageTitle'
import { queryClient } from '@/utils/queryClient'

function TransactionManagerSetup({ children }: { children: ReactNode }) {
  const publicClient = usePublicClient()

  useAutoFundOnLowBalance()
  useTransactionModalRouteReset()

  useEffect(() => {
    if (publicClient) {
      transactionManager.setPublicClient(sepoliaWithEns.id, publicClient)
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
  // The router re-runs this on every navigation, so the title tracks the route
  // without each route having to restate it.
  // The router re-runs this on every navigation, so the title tracks the route
  // without each route having to restate it.
  head: ({ matches }) => {
    const match = matches[matches.length - 1]
    const pathname = match?.pathname.replace(/(.)\/$/, '$1') ?? '/'
    const { name } = (match?.search ?? {}) as { name?: unknown }

    return {
      meta: [
        {
          title: getPageTitle(
            pathname,
            typeof name === 'string' ? name : undefined,
          ),
        },
      ],
    }
  },
  component: () => {
    return (
      <>
        {/* The worker also injects a <title> into index.html, so after hydration
            the document holds two. React 19 hoists its own ahead of the existing
            one and document.title reads the first in tree order, which is why
            this wins. Removing the duplicate would silently restore the bug. */}
        <HeadContent />
        <WagmiProvider config={wagmiConfig}>
          <QueryClientProvider client={queryClient}>
            {isMockWalletEnabled && <MockWalletAutoConnect />}
            <ConnectModalProvider>
              <TransactionManagerSetup>
                <PHProvider>
                  <Outlet />
                </PHProvider>
              </TransactionManagerSetup>
            </ConnectModalProvider>
            {/* Inside QueryClientProvider on purpose: the dev panels use
                useQueryClient/useQuery (to invalidate the app's own queries
                after seeding a name or warping time), so mounting them outside
                it throws as soon as the drawer is opened. */}
            <DevDrawer />
          </QueryClientProvider>
        </WagmiProvider>

        <Toaster position="top-right" richColors duration={4000} />
        <TanStackRouterDevtools position="bottom-right" />
      </>
    )
  },
  notFoundComponent: () => <NotFoundMessage />,
})
