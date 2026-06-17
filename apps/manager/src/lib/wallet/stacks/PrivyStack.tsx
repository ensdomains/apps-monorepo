import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { useConfig, useReconnect } from 'wagmi'
import { LoginDialog } from '@/features/auth/LoginDialog'
import {
  hasStoredPrivySession,
  isPrivyOAuthRedirect,
} from '@/lib/privy/has-privy-session'
import {
  privyLoadStore,
  requestPrivyLoad,
} from '@/lib/privy/privy-session-store'
import { usePrivySession } from '@/lib/privy/usePrivySession'
import { wagmiConfig } from '@/lib/wagmi'
import { WalletUiProvider, type WalletUiValue } from '../wallet-context'

// The Privy SDK (~1.2 MB gzip) lives in this lazy chunk so it stays off the
// initial/SSR bundle (see docs/PRIVY.md). Everything else reads the session
// from privy-session-store.
const PrivyRuntime = lazy(() => import('@/lib/privy/PrivyRuntime'))

// Constraint #1, at runtime: useConfig() must be our wagmiConfig. If
// @privy-io/wagmi ever shadowed our WagmiProvider it'd return a different config
// and throw here, before any data flows. Pairs with `pnpm audit:wagmi-providers`.
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

/**
 * `reconnectOnMount` is off (see WalletProvider) so wagmi doesn't blindly
 * reconnect a stale external wallet that races the Privy bridge. We reconnect
 * external wallets ourselves, only when there's no Privy session — reconnect()
 * skips the privy connector anyway (isAuthorized() is false until the bridge
 * installs a provider).
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

// Fills WalletUiContext from the Privy session. Opening the dialog kicks off the
// lazy SDK load; `clearSession` is the Privy logout that useSignOut runs before
// the wagmi disconnect.
const PrivyWalletUi = ({ children }: { children: React.ReactNode }) => {
  const [isOpen, setIsOpen] = useState(false)
  const { logout, busy } = usePrivySession()

  const value = useMemo<WalletUiValue>(
    () => ({
      openLogin: () => {
        requestPrivyLoad()
        setIsOpen(true)
      },
      isOpen,
      clearSession: logout,
      isClearingSession: busy,
    }),
    [isOpen, logout, busy],
  )

  return (
    <WalletUiProvider value={value}>
      {children}
      <LoginDialog onOpenChange={setIsOpen} open={isOpen} />
    </WalletUiProvider>
  )
}

/** Privy wallet stack: social/email login via a lazy SDK over our wagmi config. */
const PrivyStack = ({ children }: { children: React.ReactNode }) => (
  <WagmiBootAssertion>
    <ExternalWalletReconnect />
    <PrivyLoader />
    <PrivyWalletUi>{children}</PrivyWalletUi>
  </WagmiBootAssertion>
)

export default PrivyStack
