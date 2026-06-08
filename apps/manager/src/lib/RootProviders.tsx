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
import { wagmiConfig } from './wagmi'

/**
 * Reacts to wallet connection lifecycle changes. Replaces the side effects
 * that previously lived in the Para provider callbacks:
 *  - when the active address no longer matches the backend-authed address,
 *    drop the stale backend session and any in-flight transactions.
 *  - on disconnect, clear everything (transactions, backend auth, local
 *    storage, analytics identity).
 */
const WalletLifecycle = () => {
  const { address } = useConnection()

  // Keyed on `address` so it also fires on in-place account switches
  // (MetaMask/Frame `change` events keep status === 'connected', which
  // useConnectionEffect.onConnect does NOT fire for). If the connected
  // address no longer matches the address we authed the backend with, the
  // session and any transactions tied to the old identity are stale.
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
