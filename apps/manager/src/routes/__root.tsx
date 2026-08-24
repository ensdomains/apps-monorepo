import { DevDrawer } from '@ens-apps/dev-tools'
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
import { MATERIAL_SYMBOLS_URL, MSymbol } from '@/components/ui/material-symbol'
import { NotFoundPage } from '@/features/not-found/pages/NotFoundPage'
import { RootProviders } from '@/lib/RootProviders'
import {
  buildCspWithoutFrameAncestors,
  CSP_REPORT_ONLY,
  getCspNonce,
} from '@/server/csp'
import appCss from '@/styles/index.css?url'

type RootRouterContext = {
  queryClient: QueryClient
}

const toastIconClassName =
  'ens-sonner-icon ms-fill ms-opsz-24 ms-wght-400 size-6 text-2xl leading-none'

export const Route = createRootRouteWithContext<RootRouterContext>()({
  head: () => {
    // CSP meta is a defense-in-depth complement to the HTTP header set in
    // src/start.ts. frame-ancestors is omitted (invalid in <meta>). Skip in
    // DEV — Vite HMR needs eval/ws that the production policy forbids.
    const cspNonce = import.meta.env.DEV ? undefined : getCspNonce()

    // A <meta http-equiv> CSP is ALWAYS enforcing — there is no Report-Only
    // form of it. During the report-only rollout the meta tag must therefore be
    // omitted, or it would block in the browser while the header merely
    // reported. See CSP_REPORT_ONLY in server/csp.ts.
    const cspMeta =
      cspNonce && !CSP_REPORT_ONLY
        ? [
            {
              httpEquiv: 'Content-Security-Policy' as const,
              content: buildCspWithoutFrameAncestors({ nonce: cspNonce }),
            },
          ]
        : []

    // TanStack Start's client runtime reads the nonce back off this tag
    // (`meta[property="csp-nonce"]` in router-core's ssr-client) so scripts it
    // injects after hydration carry it. Emitted in both rollout modes.
    const cspNonceMeta = cspNonce
      ? [{ property: 'csp-nonce' as const, content: cspNonce }]
      : []

    return {
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
        { name: 'theme-color', content: '#0082BB' },
        ...cspNonceMeta,
        ...cspMeta,
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
    }
  },
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
        <TanStackRouterDevtools position="bottom-right" />
        <Scripts />
      </body>
    </html>
  )
}
