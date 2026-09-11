import { DevDrawer } from '@ens-apps/dev-tools'
import type { QueryClient } from '@tanstack/react-query'
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
} from '@tanstack/react-router'
import { lazy, Suspense } from 'react'
import { Toaster } from 'sonner'
import { Layout } from '@/components/Layout'
import { MATERIAL_SYMBOLS_URL, MSymbol } from '@/components/ui/material-symbol'
import { NotFoundPage } from '@/features/not-found/pages/NotFoundPage'
import { RootProviders } from '@/lib/RootProviders'
import appCss from '@/styles/index.css?url'
import { DEBUG_FEATURES_ENABLED } from '@/utils/debug-features'
import { defaultOgImageUrl, seo } from '@/utils/seo'

const TanStackRouterDevtools = DEBUG_FEATURES_ENABLED
  ? lazy(() =>
      import('@tanstack/react-router-devtools').then((mod) => ({
        default: mod.TanStackRouterDevtools,
      })),
    )
  : () => null

type RootRouterContext = {
  queryClient: QueryClient
}

const toastIconClassName =
  'ens-sonner-icon ms-fill ms-opsz-24 ms-wght-400 size-6 text-2xl leading-none'

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
      { name: 'theme-color', content: '#0082BB' },
      // Defaults for every route; a route with a card of its own (a name, say)
      // overrides these from its own `head`.
      ...seo({
        title: 'ENS App',
        description: 'Manage your ENS names, profiles and records.',
        image: defaultOgImageUrl(),
      }),
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
      {
        rel: 'stylesheet',
        href: MATERIAL_SYMBOLS_URL,
      },
      { rel: 'icon', href: '/favicon.ico', sizes: 'any' },
      { rel: 'apple-touch-icon', href: '/apple-icon-180x180.png' },
      { rel: 'manifest', href: '/manifest.json' },
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
          <Toaster
            icons={{
              error: (
                <MSymbol className={toastIconClassName} symbol="warning" />
              ),
              info: <MSymbol className={toastIconClassName} symbol="info" />,
              loading: (
                <MSymbol className={toastIconClassName} symbol="hourglass" />
              ),
              success: (
                <MSymbol className={toastIconClassName} symbol="check" />
              ),
              warning: (
                <MSymbol className={toastIconClassName} symbol="warning" />
              ),
            }}
            position="bottom-right"
            toastOptions={{
              classNames: {
                actionButton: 'ens-sonner-action-button',
                cancelButton: 'ens-sonner-cancel-button',
                closeButton: 'ens-sonner-close-button',
                description: 'ens-sonner-description',
                icon: 'ens-sonner-icon-slot',
                title: 'ens-sonner-title',
                toast: 'ens-sonner-toast',
              },
            }}
          />
        </RootProviders>

        <DevDrawer />
        {DEBUG_FEATURES_ENABLED ? (
          <Suspense>
            <TanStackRouterDevtools position="bottom-right" />
          </Suspense>
        ) : null}
        <Scripts />
      </body>
    </html>
  )
}
