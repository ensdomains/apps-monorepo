/// <reference types="vite/client" />

import { RainbowKitProvider } from '@rainbow-me/rainbowkit'
import rainbowKitCss from '@rainbow-me/rainbowkit/styles.css?url'
import type { QueryClient } from '@tanstack/react-query'
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import type { ReactNode } from 'react'
import { Toaster } from 'sonner'
import { WagmiProvider } from 'wagmi'
import { Layout } from '@/components/Layout'
import { wagmiConfig } from '@/lib/wagmi'
import appCss from '@/styles/index.css?url'

interface ProvidersWrapperProps {
  children: React.ReactNode
}

const ProvidersWrapper = ({ children }: ProvidersWrapperProps) => {
  return (
    <WagmiProvider config={wagmiConfig}>
      <RainbowKitProvider>{children}</RainbowKitProvider>
    </WagmiProvider>
  )
}

interface RootRouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RootRouterContext>()({
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
  notFoundComponent: NotFoundComponent,
})

function NotFoundComponent() {
  return <div>Not Found</div>
}

function RootComponent() {
  return (
    <RootDocument>
      <ProvidersWrapper>
        <Layout>
          <Outlet />
        </Layout>
        <Toaster position="top-right" />
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
