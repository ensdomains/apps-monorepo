import { RainbowKitProvider } from '@rainbow-me/rainbowkit'
import { QueryClientProvider } from '@tanstack/react-query'
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { WagmiProvider } from 'wagmi'
import { Layout } from '@/components/Layout'
import { queryClient } from '@/utils/queryClient'
import '@getpara/react-sdk/styles.css'
import { wagmiConfig } from '@/lib/wagmi'

const ProvidersWrapper = ({ children }: { children: React.ReactNode }) => {
  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
        <RainbowKitProvider>{children}</RainbowKitProvider>
      </WagmiProvider>
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
