/// <reference types="vite/client" />

import { RainbowKitProvider } from '@rainbow-me/rainbowkit'
import rainbowKitCss from '@rainbow-me/rainbowkit/styles.css?url'
import { QueryClientProvider } from '@tanstack/react-query'
import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { Web3AuthProvider } from '@web3auth/modal/react'
import { WagmiProvider } from 'wagmi'
import { wagmiConfig } from '@/lib/wagmi'
import type { ReactNode } from 'react'
import { Layout } from '@/components/Layout'
import web3AuthContextConfig from '@/lib/web3Auth/web3AuthContext'
import appCss from '@/styles/index.css?url'
import { queryClient } from '@/utils/queryClient'

const ProvidersWrapper = ({ children }: { children: React.ReactNode }) => {
  return (
    <Web3AuthProvider config={web3AuthContextConfig}>
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          <RainbowKitProvider>{children}</RainbowKitProvider>
        </WagmiProvider>
      </QueryClientProvider>
    </Web3AuthProvider>
  )
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'ENS App',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
      {
        rel: 'stylesheet',
        href: rainbowKitCss,
      },
    ],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <RootDocument>
      <ProvidersWrapper>
        <Layout>
          <Outlet />
        </Layout>
      </ProvidersWrapper>
      <TanStackRouterDevtools position="bottom-right" />
    </RootDocument>
  )
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
