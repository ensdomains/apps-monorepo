import type { QueryClient } from '@tanstack/react-query'
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import type { ReactNode } from 'react'
import { Layout } from '@/components/Layout'
import { WalletModal } from '@/features/wallet/components/Modal'
import { PrivyContextProvider } from '@/lib/privy'
import appCss from '@/styles/index.css?url'

const ProvidersWrapper = ({ children }: { children: React.ReactNode }) => {
  return (
    <PrivyContextProvider>
      {children}
      <WalletModal />
    </PrivyContextProvider>
  )
}

type RootRouterContext = {
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
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body suppressHydrationWarning>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
