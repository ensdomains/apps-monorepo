import { usePrivy } from '@privy-io/react-auth'
import { useCallback } from 'react'
import { useDisconnect } from 'wagmi'

// Sign-out: clear the Privy session first so its tokens are gone before the
// wagmi disconnect fires the app's onDisconnect cleanup (logout is a no-op for
// an external wallet that never authenticated with Privy). `isDisconnecting`
// comes from the wagmi mutation so callers don't track it themselves.
export const useWalletDisconnect = () => {
  const { authenticated, logout } = usePrivy()
  const { mutateAsync, isPending } = useDisconnect()
  const disconnect = useCallback(async () => {
    if (authenticated) await logout()
    await mutateAsync().catch(() => {})
  }, [authenticated, logout, mutateAsync])
  return { disconnect, isDisconnecting: isPending }
}
