import { useEffect } from 'react'
import { useConnection } from 'wagmi'
import { useSmartAccountContext } from '@/lib/smart-account/SmartAccountContext'

/**
 * useOnDisconnected
 *
 * Calls `onDisconnect` once the wallet is genuinely, finally disconnected.
 *
 * The disconnect *signal* is wagmi's connection status — the immediate source
 * of truth — NOT the smart-account machine's derived `isConnected`, which lags
 * during the reconnect window (wagmi reconnected, machine not yet synced).
 * Reading that gap as a disconnect fired a spurious `navigate()` mid-reload
 * that raced TanStack Router and blanked the page (`Outlet` throwing
 * `undefined`).
 *
 * It is still *gated* on the connection having settled — wagmi not
 * (re)connecting and the smart-account provider having finished its initial
 * restoration (`hasInitialized`) — so a session that is still being restored
 * on load is never bounced to the landing page. `status` alone drives the
 * single call, so a real disconnect fires `onDisconnect` exactly once.
 *
 * @param onDisconnect Callback to call when the wallet is disconnected.
 */
export const useOnDisconnected = (onDisconnect: () => void) => {
  const { status, isConnecting, isReconnecting } = useConnection()
  const { hasInitialized } = useSmartAccountContext()

  useEffect(() => {
    if (isConnecting || isReconnecting || !hasInitialized) return
    if (status === 'disconnected') {
      onDisconnect()
    }
  }, [status, isConnecting, isReconnecting, hasInitialized, onDisconnect])
}
