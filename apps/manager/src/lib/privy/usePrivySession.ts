import { useSyncExternalStore } from 'react'
import {
  type PrivySessionValue,
  privySessionStore,
} from './privy-session-store'

/**
 * The Privy session, read from the store the lazily loaded PrivyRuntime
 * publishes into. This hook does NOT import `@privy-io/react-auth`, so the
 * components that use it (LoginDialog, WalletSection, useSignOut, the dashboard
 * guard) don't drag the ~1.2 MB SDK into the initial/SSR bundle.
 *
 * Until PrivyRuntime has loaded + mounted, this returns safe logged-out
 * defaults (see privy-session-store). The login dialog disables its social
 * buttons until `ready`, so the real runtime callbacks are in place before they
 * can be invoked.
 */
export function usePrivySession(): PrivySessionValue {
  return useSyncExternalStore(
    privySessionStore.subscribe,
    privySessionStore.getSnapshot,
    privySessionStore.getServerSnapshot,
  )
}
