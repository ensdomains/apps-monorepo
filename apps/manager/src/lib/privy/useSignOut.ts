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
  const { logout, busy } = usePrivySession()
  const { mutateAsync: disconnectAsync, isPending: isDisconnecting } =
    useDisconnect()

  const signOut = useCallback(async () => {
    await Promise.allSettled([logout(), disconnectAsync()])
  }, [logout, disconnectAsync])

  return { signOut, isSigningOut: busy || isDisconnecting }
}
