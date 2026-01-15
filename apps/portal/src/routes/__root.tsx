import { RainbowKitProvider } from '@rainbow-me/rainbowkit'
import { QueryClientProvider } from '@tanstack/react-query'
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { WagmiProvider } from 'wagmi'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { PasswordModal } from '@/components/PasswordModal'
import { wagmiConfig } from '@/lib/wagmi'
import { queryClient } from '@/utils/queryClient'

const hash =
  '0x6337f5f46479e89c07cbe68b81705a654d86277ebf2d47d5bf7d04b7d3fd4c45'

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
              <Outlet />
            </RainbowKitProvider>
          </QueryClientProvider>
        </WagmiProvider>

        <TanStackRouterDevtools />
      </>
    )
  },
  notFoundComponent: () => <NotFoundMessage />,
})
