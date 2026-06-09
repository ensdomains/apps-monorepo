import { transactionManager } from '@ens-apps/transaction-manager'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { PrivyProvider } from '@privy-io/react-auth'
import { QueryClientProvider } from '@tanstack/react-query'
import { useRouteContext } from '@tanstack/react-router'
import posthog from 'posthog-js'
import { useEffect } from 'react'
import {
  useConfig,
  useConnection,
  useConnectionEffect,
  WagmiProvider,
} from 'wagmi'
import { track } from '@/lib/posthog/events'
import { PHProvider } from '@/lib/posthog/provider'
import { SmartAccountContextProvider } from '@/lib/smart-account'
import { backendAuthStore } from '@/utils/backend-client'
import { ConnectionCookieSync } from './ConnectionCookieSync'
import { usePrivyWagmiBridge } from './privy/usePrivyWagmiBridge'
import { wagmiConfig } from './wagmi'

const privyAppId = import.meta.env.VITE_PRIVY_APP_ID ?? ''

// Preserve wallet-layer connection storage (wagmi.* / privy:*) — a blanket
// localStorage.clear() corrupts reconnection. Privy owns its own `privy:*`
// session keys; let `privy.logout()` clear those, not us.
const clearAppLocalStorage = () => {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('wagmi') || key.startsWith('privy:')) continue
    localStorage.removeItem(key)
  }
}

/**
 * Drives the Privy session → wagmi connector bridge. Rendered (not a bare hook
 * call in RootProviders) so it only mounts inside PrivyProvider.
 */
const PrivyBridge = () => {
  usePrivyWagmiBridge()
  return null
}

/**
 * Constraint #1, enforced at runtime. `useConfig()` must return the exact
 * `wagmiConfig` instance from src/lib/wagmi.ts. If `@privy-io/wagmi` were ever
 * installed and mounted its own WagmiProvider between ours and the app, that
 * shadow provider would have a different config reference and this throws at
 * boot — before any user data flows through the wrong config. Pairs with the
 * CI audit (scripts/audit-wagmi-providers.mjs).
 */
const WagmiBootAssertion = ({ children }: { children: React.ReactNode }) => {
  const observed = useConfig()
  if (observed !== wagmiConfig) {
    throw new Error(
      '[manager] useConfig() did not return src/lib/wagmi.ts → wagmiConfig. ' +
        'A vendor package is shadowing our WagmiProvider — almost certainly ' +
        '@privy-io/wagmi got installed and mounted. Remove it and use ' +
        'src/lib/privy/privy-connector.ts. Run `pnpm audit:wagmi-providers`.',
    )
  }
  return <>{children}</>
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

  const tree = (
    <WagmiBootAssertion>
      <ConnectionCookieSync />
      <WalletLifecycle />
      {/* Bridge only mounts when Privy is configured (it needs Privy context). */}
      {privyAppId ? <PrivyBridge /> : null}
      <PHProvider>
        <SmartAccountContextProvider>{children}</SmartAccountContextProvider>
      </PHProvider>
    </WagmiBootAssertion>
  )

  return (
    <I18nProvider i18n={i18n}>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          {/* Headless Privy: login() is never called; no smart/global wallets;
              showWalletUIs:false suppresses vendor confirmation dialogs. Social
              methods are Google + X only. When VITE_PRIVY_APP_ID is unset the
              app still boots (auth disabled) so non-auth flows keep working. */}
          {privyAppId ? (
            <PrivyProvider
              appId={privyAppId}
              config={{
                loginMethods: ['google', 'twitter'],
                embeddedWallets: {
                  ethereum: { createOnLogin: 'users-without-wallets' },
                  showWalletUIs: false,
                },
                appearance: { walletList: [] },
              }}
            >
              {tree}
            </PrivyProvider>
          ) : (
            tree
          )}
        </QueryClientProvider>
      </WagmiProvider>
    </I18nProvider>
  )
}
