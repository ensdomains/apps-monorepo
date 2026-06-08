import { RainbowKitProvider } from '@rainbow-me/rainbowkit'
import { useRouteContext } from '@tanstack/react-router'
import { SmartAccountContextProvider } from '@/lib/smart-account'
import '@rainbow-me/rainbowkit/styles.css'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { PHProvider } from '@/lib/posthog/provider'
import { WalletConnectionLifecycle } from './WalletConnectionLifecycle'
import { wagmiConfig } from './wagmi'

export const RootProviders = ({ children }: { children: React.ReactNode }) => {
  const queryClient = useRouteContext({
    from: '__root__',
    select: (context) => context.queryClient,
  })

  return (
    <I18nProvider i18n={i18n}>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitProvider>
            <WalletConnectionLifecycle />
            <PHProvider>
              <SmartAccountContextProvider>
                {children}
              </SmartAccountContextProvider>
            </PHProvider>
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </I18nProvider>
  )
}
