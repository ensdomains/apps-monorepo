import { QueryClientProvider } from '@tanstack/react-query'
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { WagmiProvider } from 'wagmi'
import { Layout } from '@/components/Layout'
import { wagmiConfig } from '@/lib/walletKit/wagmiConfig'
import { queryClient } from '@/utils/queryClient'

const ProvidersWrapper = ({ children }: { children: React.ReactNode }) => {
  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>{children}</WagmiProvider>
    </QueryClientProvider>
  )
}

export const Route = createRootRoute({
  component: () => {
    return (
      <>
        <ProvidersWrapper>
          <Layout>
            <Outlet />
          </Layout>
        </ProvidersWrapper>

        <TanStackRouterDevtools position="bottom-right" />
      </>
    )
  },
})
