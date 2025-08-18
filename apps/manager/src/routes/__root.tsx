import { RainbowKitProvider } from '@rainbow-me/rainbowkit'
import { QueryClientProvider } from '@tanstack/react-query'
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { Web3AuthProvider } from '@web3auth/modal/react'
import { WagmiProvider } from '@web3auth/modal/react/wagmi'
import { Layout } from '@/components/Layout'
import web3AuthContextConfig from '@/lib/web3Auth/web3AuthContext'
import { queryClient } from '@/utils/queryClient'

const ProvidersWrapper = ({ children }: { children: React.ReactNode }) => {
  return (
    <Web3AuthProvider config={web3AuthContextConfig}>
      <QueryClientProvider client={queryClient}>
        <WagmiProvider>
          <RainbowKitProvider>{children}</RainbowKitProvider>
        </WagmiProvider>
      </QueryClientProvider>
    </Web3AuthProvider>
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
