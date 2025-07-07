import { RainbowKitProvider } from '@rainbow-me/rainbowkit'
import { QueryClientProvider } from '@tanstack/react-query'
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { WagmiProvider } from 'wagmi'
import { Layout } from '@/components/Layout'
import { wagmiConfig } from '@/lib/wagmi'
import { queryClient } from '@/utils/queryClient'

const ProvidersWrapper = ({ children }: { children: React.ReactNode }) => {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
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
