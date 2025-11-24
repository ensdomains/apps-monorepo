import { ParaProvider } from '@getpara/react-sdk-lite'
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
import appCss from '@/styles/index.css?url'
import '@getpara/react-sdk-lite/styles.css'
import { QueryClientProvider } from '@tanstack/react-query'
import { customSepolia } from '@/lib/wagmi'

const ProvidersWrapper = ({ children }: { children: React.ReactNode }) => {
  const VITE_PARA_API_KEY = import.meta.env.VITE_PARA_API_KEY

  if (!VITE_PARA_API_KEY) {
    throw new Error('VITE_PARA_API_KEY is not defined in environment variables')
  }

  const { queryClient } = Route.useRouteContext()

  return (
    <QueryClientProvider client={queryClient}>
      <ParaProvider
        paraClientConfig={{
          apiKey: VITE_PARA_API_KEY,
          env: 'BETA' as any,
        }}
        config={{
          appName: 'ENS Manager',
        }}
        externalWalletConfig={{
          wallets: ['METAMASK', 'WALLETCONNECT'],
          // createLinkedEmbeddedForExternalWallets: ['METAMASK'],
          evmConnector: {
            config: {
              chains: [customSepolia],
            },
          },
          walletConnect: {
            projectId: '21fef48091f12692cad574a6f7753643',
          },
        }}
        paraModalConfig={{
          disableEmailLogin: false,
          disablePhoneLogin: true,
          onRampTestMode: true,
          oAuthMethods: ['GOOGLE', 'TWITTER', 'TELEGRAM'],
          authLayout: ['AUTH:FULL', 'EXTERNAL:FULL'],
          recoverySecretStepEnabled: true,

          theme: {
            foregroundColor: '#2D3648',
            backgroundColor: '#FFFFFF',
            accentColor: '#0066CC',
            darkForegroundColor: '#E8EBF2',
            darkBackgroundColor: '#1A1F2B',
            darkAccentColor: '#4D9FFF',
            mode: 'light',
            borderRadius: 'lg',
            font: 'Inter',
          },
          twoFactorAuthEnabled: false,
        }}
      >
        {children}
      </ParaProvider>
    </QueryClientProvider>
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
