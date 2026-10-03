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
// Deep import, NOT the feature barrel: the barrel re-exports the whole
// register workflow (steps, machines, transaction-manager deps), which would
// end up in the chunk every route loads.
import { useOrphanRegistrationCleanup } from '@/features/register-v2/state/useOrphanRegistrationCleanup'
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

const GOOGLE_FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Geist:wght@100..900&family=Geist+Mono:wght@100..900&family=Libre+Baskerville:ital,wght@0,400;1,400&display=swap'

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
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      {
        rel: 'preconnect',
        href: 'https://fonts.gstatic.com',
        crossOrigin: 'anonymous',
      },
      {
        rel: 'stylesheet',
        href: GOOGLE_FONTS_URL,
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

/**
 * Renders nothing — it exists so the cleanup runs above `/register/$name`,
 * whose loader redirects away exactly when a stored registration needs
 * resolving. See `orphanRegistrationCleanup.ts`.
 */
const RegistrationOrphanCleanup = () => {
  useOrphanRegistrationCleanup()
  return null
}

function RootComponent() {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body suppressHydrationWarning>
        <RootProviders>
          <RegistrationOrphanCleanup />
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
