import { transactionManager } from '@ens-apps/transaction-manager'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { PrivyProvider } from '@privy-io/react-auth'
import { QueryClientProvider } from '@tanstack/react-query'
import { useRouteContext } from '@tanstack/react-router'
import posthog from 'posthog-js'
import { useEffect, useRef } from 'react'
import {
  useConfig,
  useConnection,
  useConnectionEffect,
  useReconnect,
  WagmiProvider,
} from 'wagmi'
import { LoginModalProvider } from '@/features/auth/LoginModalProvider'
import { track } from '@/lib/posthog/events'
import { PHProvider } from '@/lib/posthog/provider'
import { SmartAccountContextProvider } from '@/lib/smart-account'
import { backendAuthStore } from '@/utils/backend-client'
import { ConnectionCookieSync } from './ConnectionCookieSync'
import { hasStoredPrivySession } from './privy/has-privy-session'
import { usePrivyWagmiBridge } from './privy/usePrivyWagmiBridge'
import { wagmiConfig } from './wagmi'

const privyAppId = import.meta.env.VITE_PRIVY_APP_ID ?? ''

// Preserve wallet-layer connection storage — a blanket localStorage.clear()
// corrupts reconnection. Privy owns its session under BOTH `privy-` (hyphen:
// privy-token, privy-refresh-token, privy-session, privy-id-token, …) AND
// `privy:` (colon: privy:connections, …) keys, so we must preserve anything
// starting with `privy`; `privy.logout()` clears those itself. Deleting the
// `privy-*` tokens here was wiping the session on every disconnect/reload.
const clearAppLocalStorage = () => {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('wagmi') || key.startsWith('privy')) continue
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
 * Re-establish the previous wallet connection on load.
 *
 * We set `reconnectOnMount={false}` on WagmiProvider so wagmi doesn't blindly
 * auto-reconnect the last connector on every mount. That blind reconnect was
 * the source of the "MetaMask address shows instead of the Google address"
 * fight: a returning social user would have their stale external wallet
 * reconnected on reload, racing the Privy bridge.
 *
 * Instead we reconnect ourselves, ONCE, and ONLY when there's no Privy session:
 *   - No Privy session  → restore the external wallet (MetaMask / WalletConnect)
 *     the user last connected, so they stay logged in across reloads.
 *   - Privy session present → do nothing here; the bridge owns the connection.
 *     (wagmi's reconnect() skips the privy connector anyway — its isAuthorized()
 *     is false until the bridge installs a provider — so this only ever restores
 *     external wallets.)
 */
const ExternalWalletReconnect = () => {
  const { reconnect } = useReconnect()
  const done = useRef(false)

  useEffect(() => {
    if (done.current) return
    done.current = true
    if (!hasStoredPrivySession()) {
      reconnect()
    }
  }, [reconnect])

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
      // Skip during the reload reconnect gap: the Privy session is still in
      // storage and the bridge will reconnect, so this isn't a real disconnect.
      // A genuine logout clears the Privy tokens first (see useSignOut), so the
      // cleanup still runs then.
      if (hasStoredPrivySession()) return
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

  // LoginModalProvider renders the social-login dialog and must sit inside
  // PrivyProvider (it uses the headless Privy hooks); when Privy isn't
  // configured, consumers fall back to useLoginModal's no-op default.
  const wrappedChildren = privyAppId ? (
    <LoginModalProvider>{children}</LoginModalProvider>
  ) : (
    children
  )

  const tree = (
    <WagmiBootAssertion>
      <ExternalWalletReconnect />
      <ConnectionCookieSync />
      <WalletLifecycle />
      {/* Bridge only mounts when Privy is configured (it needs Privy context). */}
      {privyAppId ? <PrivyBridge /> : null}
      <PHProvider>
        <SmartAccountContextProvider>
          {wrappedChildren}
        </SmartAccountContextProvider>
      </PHProvider>
    </WagmiBootAssertion>
  )

  return (
    <I18nProvider i18n={i18n}>
      {/* reconnectOnMount disabled: ExternalWalletReconnect drives reconnection
          ourselves (only when there's no Privy session) to avoid a stale
          external wallet racing the Privy bridge on reload. */}
      <WagmiProvider config={wagmiConfig} reconnectOnMount={false}>
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
