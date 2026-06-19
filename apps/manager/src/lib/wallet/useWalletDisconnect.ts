import { usePrivy } from '@privy-io/react-auth'
import { useCallback, useState } from 'react'
import { useDisconnect } from 'wagmi'

// Sign-out: clear the Privy session first so its tokens are gone before the
// wagmi disconnect fires the app's onDisconnect cleanup (logout is a no-op for
// an external wallet that never authenticated with Privy). `isDisconnecting`
// spans both phases — the wagmi mutation's `isPending` only covers the second —
// so callers can gate their UI for the whole operation.
export const useWalletDisconnect = () => {
  const { authenticated, logout } = usePrivy()
  const { mutateAsync, isPending } = useDisconnect()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const disconnect = useCallback(async () => {
    try {
      // Swallow a logout rejection so the wagmi disconnect (and the onDisconnect
      // cleanup it triggers) still runs — a failed Privy logout must not leave
      // the user connected after they clicked Disconnect.
      if (authenticated) {
        setIsLoggingOut(true)
        await logout().catch(() => {})
      }
      await mutateAsync().catch(() => {})
    } finally {
      setIsLoggingOut(false)
    }
  }, [authenticated, logout, mutateAsync])
  return { disconnect, isDisconnecting: isLoggingOut || isPending }
}
