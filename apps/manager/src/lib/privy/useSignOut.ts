import { useNavigate } from '@tanstack/react-router'
import { useCallback } from 'react'
import { useDisconnect } from 'wagmi'
import { usePrivySession } from './usePrivySession'

/**
 * Unified sign-out.
 *
 * Privy's session and wagmi's connection persist separately, so a "disconnect"
 * that only touches one store can leave the app half-signed-out (e.g. Privy
 * session gone but wagmi still connected, or vice-versa). This flushes BOTH,
 * idempotently, regardless of which connector is active:
 *   - `logout()` clears the Privy session (a harmless no-op for an external
 *     wallet that never authenticated with Privy).
 *   - wagmi `disconnect()` clears the active connection.
 *
 * The wagmi disconnect fires the existing onDisconnect cleanup
 * (WalletLifecycle: backend auth + transactions + analytics reset), so this is
 * the single canonical "sign out" path.
 */
export function useSignOut() {
  const navigate = useNavigate()
  const { logout, busy } = usePrivySession()
  const { mutateAsync: disconnectAsync, isPending: isDisconnecting } =
    useDisconnect()

  const signOut = useCallback(async () => {
    // Clear Privy FIRST so its session tokens are gone before the wagmi
    // disconnect fires onDisconnect — that cleanup skips while a Privy session
    // persists (to ignore the reload gap), so a genuine logout must clear the
    // tokens up front for the cleanup to run. logout() is wrapped (never
    // throws) and is a no-op for external wallets.
    await logout()
    await disconnectAsync().catch(() => {})
    // Always land back on the landing page after a sign-out, from any route.
    // (useOnDisconnected only redirects from the dashboard and can be gated by
    // the smart-account init/reconnect guards; this is the canonical path.)
    navigate({ to: '/' })
  }, [logout, disconnectAsync, navigate])

  return { signOut, isSigningOut: busy || isDisconnecting }
}
