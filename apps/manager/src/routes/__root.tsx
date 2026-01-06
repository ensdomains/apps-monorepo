import type { QueryClient } from '@tanstack/react-query'
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { Toaster } from 'sonner'
import { Layout } from '@/components/Layout'
import { NotFoundPage } from '@/features/not-found/pages/NotFoundPage'
import { ParaWagmiSyncWatcher } from '@/features/wallet/components/ParaWagmiSyncWatcher'
import { RootProviders } from '@/lib/RootProviders'
import appCss from '@/styles/index.css?url'

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
  notFoundComponent: NotFoundPage,
})

function RootComponent() {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body suppressHydrationWarning>
        <RootProviders>
          <Layout>
            <Outlet />
          </Layout>
          <ParaWagmiSyncWatcher />
          <Toaster position="bottom-center" />
        </RootProviders>

        <TanStackRouterDevtools position="bottom-right" />
        <Scripts />
      </body>
    </html>
  )
}
