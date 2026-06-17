import { transactionManager } from '@ens-apps/transaction-manager'
import { RainbowKitProvider } from '@rainbow-me/rainbowkit'
import { useRouteContext } from '@tanstack/react-router'
import { SmartAccountContextProvider } from '@/lib/smart-account'
import '@rainbow-me/rainbowkit/styles.css'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClientProvider } from '@tanstack/react-query'
import posthog from 'posthog-js'
import { useEffect } from 'react'
import { useConnection, useConnectionEffect, WagmiProvider } from 'wagmi'
import { track } from '@/lib/posthog/events'
import { PHProvider } from '@/lib/posthog/provider'
import { backendAuthStore } from '@/utils/backend-client'
import { ConnectionCookieSync } from './ConnectionCookieSync'
import { TransactionHistoryReporter } from './transaction-history/TransactionHistoryReporter'
import { wagmiConfig } from './wagmi'

// Preserve wagmi's/RainbowKit's connection storage (wagmi.* / rk-*) — a blanket
// localStorage.clear() corrupts reconnection.
const clearAppLocalStorage = () => {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('wagmi') || key.startsWith('rk-')) continue
    localStorage.removeItem(key)
  }
}

const WalletLifecycle = () => {
  const { address } = useConnection()

  // Keyed on `address` so in-place account switches fire too
  // (useConnectionEffect.onConnect doesn't, as status stays "connected"):
  // drop stale backend auth + transactions when the active address differs
  // from the one we authed with.
  useEffect(() => {
    if (!address) return

    const authedAddress = backendAuthStore.get().context.address
    if (
      authedAddress &&
      authedAddress.toLowerCase() !== address.toLowerCase()
    ) {
      transactionManager.clearAllAndPersistence()
      backendAuthStore.trigger.signOut()
    }
  }, [address])

  useConnectionEffect({
    onDisconnect() {
      transactionManager.clearAllAndPersistence()
      backendAuthStore.trigger.signOut()
      clearAppLocalStorage()
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
            <TransactionHistoryReporter />
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
