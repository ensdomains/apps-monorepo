import { transactionManager } from '@ens-apps/transaction-manager'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { useRouteContext } from '@tanstack/react-router'
import posthog from 'posthog-js'
import { lazy, Suspense, useEffect, useRef, useSyncExternalStore } from 'react'
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
import { privyLoadStore, requestPrivyLoad } from './privy/privy-session-store'
import { usePrivySession } from './privy/usePrivySession'
import { wagmiConfig } from './wagmi'

const privyAppId = import.meta.env.VITE_PRIVY_APP_ID ?? ''

// Blanket localStorage.clear() corrupts reconnection: preserve wagmi + privy
// keys (Privy stores its session under both `privy-` and `privy:` keys, and
// privy.logout() clears those itself).
const clearAppLocalStorage = () => {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('wagmi') || key.startsWith('privy')) continue
    localStorage.removeItem(key)
  }
}

// The Privy SDK (~1.2 MB gzip) lives in this lazy chunk so it stays off the
// initial/SSR bundle — the only module importing @privy-io/react-auth (see
// docs/PRIVY.md). Everything else reads the session from privy-session-store.
const PrivyRuntime = lazy(() => import('./privy/PrivyRuntime'))

// The page Privy redirects back to after social login carries
// `privy_oauth_code`; the SDK must load to consume it, else the app sticks on
// `/?privy_oauth_code=…`.
const isPrivyOAuthRedirect = () => {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).has('privy_oauth_code')
}

// Loads the Privy runtime once requestPrivyLoad() fires — on a stored session
// or an OAuth return, or when the login dialog opens. A visitor who never
// authenticates doesn't download the SDK.
const PrivyLoader = () => {
  const shouldLoad = useSyncExternalStore(
    privyLoadStore.subscribe,
    privyLoadStore.getSnapshot,
    privyLoadStore.getServerSnapshot,
  )

  useEffect(() => {
    if (hasStoredPrivySession() || isPrivyOAuthRedirect()) requestPrivyLoad()
  }, [])

  if (!shouldLoad) return null
  return (
    <Suspense fallback={null}>
      <PrivyRuntime />
    </Suspense>
  )
}

/**
 * `reconnectOnMount` is off so wagmi doesn't blindly reconnect a stale external
 * wallet that races the Privy bridge (the "MetaMask shows instead of Google"
 * fight). We reconnect external wallets ourselves, only when there's no Privy
 * session — reconnect() skips the privy connector anyway (isAuthorized() is
 * false until the bridge installs a provider).
 */
const ExternalWalletReconnect = () => {
  const { reconnect } = useReconnect()
  const { ready, isConnected } = usePrivySession()
  const initialDone = useRef(false)
  const skippedForPrivy = useRef(false)
  const fallbackDone = useRef(false)

  // No Privy session → restore the external wallet now; else defer to the bridge.
  useEffect(() => {
    if (initialDone.current) return
    initialDone.current = true
    if (hasStoredPrivySession()) {
      skippedForPrivy.current = true
    } else {
      reconnect()
    }
  }, [reconnect])

  // The deferred privy-token resolved logged-out (stale) → the bridge won't
  // connect, so restore the external wallet we skipped.
  useEffect(() => {
    if (fallbackDone.current) return
    if (skippedForPrivy.current && ready && !isConnected) {
      fallbackDone.current = true
      reconnect()
    }
  }, [ready, isConnected, reconnect])

  return null
}

// Constraint #1, at runtime: useConfig() must be our wagmiConfig. If
// @privy-io/wagmi ever shadowed our WagmiProvider it'd return a different config
// and throw here, before any data flows through it. Pairs with the CI audit.
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

  // Keyed on `address` so in-place account switches fire too: drop stale backend
  // auth + transactions when the active address differs from the authed one.
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
      // Skip during the reload gap (Privy session still stored → the bridge
      // reconnects). A genuine logout clears the Privy tokens first, so cleanup
      // still runs then.
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

  return (
    <I18nProvider i18n={i18n}>
      {/* reconnectOnMount off — see ExternalWalletReconnect. */}
      <WagmiProvider config={wagmiConfig} reconnectOnMount={false}>
        <QueryClientProvider client={queryClient}>
          <WagmiBootAssertion>
            <ExternalWalletReconnect />
            <ConnectionCookieSync />
            <WalletLifecycle />
            {/* Privy SDK is lazy-loaded; mounted only when configured. */}
            {privyAppId ? <PrivyLoader /> : null}
            <PHProvider>
              <SmartAccountContextProvider>
                <LoginModalProvider>{children}</LoginModalProvider>
              </SmartAccountContextProvider>
            </PHProvider>
          </WagmiBootAssertion>
        </QueryClientProvider>
      </WagmiProvider>
    </I18nProvider>
  )
}
