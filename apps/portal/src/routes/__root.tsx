import { queryClient, wagmiConfig } from '@/lib/wagmi'
import type { Mode } from '@ensdomains/thorin'
import { RainbowKitProvider } from '@rainbow-me/rainbowkit'
import { QueryClientProvider } from '@tanstack/react-query'
import { Outlet, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { WagmiProvider } from 'wagmi'

declare global {
  interface Window {
    __theme: Mode
    __setPreferredTheme: (theme: Mode) => void
    __onThemeChange: (theme: Mode) => void
  }
}

export const Route = createRootRoute({
  component: () => (
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
  ),
})
