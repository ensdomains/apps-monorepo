import { transactionManager } from '@ens-apps/transaction-manager'
import { RainbowKitProvider } from '@rainbow-me/rainbowkit'
import { useRouteContext } from '@tanstack/react-router'
import { SmartAccountContextProvider } from '@/lib/smart-account'
import '@rainbow-me/rainbowkit/styles.css'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClientProvider } from '@tanstack/react-query'
import posthog from 'posthog-js'
import { useRef } from 'react'
import { useConnectionEffect, WagmiProvider } from 'wagmi'
import { track } from '@/lib/posthog/events'
import { PHProvider } from '@/lib/posthog/provider'
import { backendAuthStore } from '@/utils/backend-client'
import { ConnectionCookieSync } from './ConnectionCookieSync'
import { wagmiConfig } from './wagmi'

/**
 * Reacts to wallet connection lifecycle changes. Replaces the side effects
 * that previously lived in the Para provider callbacks:
 *  - on connect to a *different* address than the one we authed with, drop
 *    the stale backend session and any in-flight transactions.
 *  - on disconnect, clear everything (transactions, backend auth, local
 *    storage, analytics identity).
 */
const WalletLifecycle = () => {
  const previousAuthAddressRef = useRef<string | null>(null)

  useConnectionEffect({
    onConnect({ address }) {
      const previousAuthAddress =
        previousAuthAddressRef.current ??
        backendAuthStore.get().context.address ??
        null
      previousAuthAddressRef.current = address ?? null

      if (
        !previousAuthAddress ||
        previousAuthAddress.toLowerCase() === address?.toLowerCase()
      ) {
        return
      }

      // Wallet switched to a different address — clear stale state.
      transactionManager.clearAllAndPersistence()
      backendAuthStore.trigger.signOut()
    },
    onDisconnect() {
      previousAuthAddressRef.current = null

      transactionManager.clearAllAndPersistence()
      backendAuthStore.trigger.signOut()
      localStorage.clear()
      track('wallet:disconnect')
      posthog.reset()
    },
  })

  return null
}

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
            <ConnectionCookieSync />
            <WalletLifecycle />
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
