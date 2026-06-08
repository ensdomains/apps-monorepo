import { useEffect } from 'react'
import { useConnection, useConnectionEffect } from 'wagmi'

/**
 * useOnDisconnected
 *
 * Calls `onDisconnect` only when the wallet is *genuinely* disconnected.
 *
 * Source of truth is wagmi's connection status — NOT the smart-account
 * machine's derived `isConnected`. That value is briefly `false` during the
 * reconnect window (wagmi already reconnected, but the machine hasn't synced
 * the wallet client yet). Reading that gap as a disconnect fired a spurious
 * `navigate()` mid-reload, which raced TanStack Router's match state and
 * blanked the page (`Outlet` throwing `undefined`).
 *
 * @param onDisconnect Callback to call when the wallet is disconnected.
 */
export const useOnDisconnected = (onDisconnect: () => void) => {
  const { status, isConnecting, isReconnecting } = useConnection()

  // wagmi's own disconnect transition (covers in-session disconnects).
  useConnectionEffect({
    onDisconnect,
  })

  useEffect(() => {
    // Never treat the initial connect / reconnect window as a disconnect.
    if (isConnecting || isReconnecting) return
    if (status === 'disconnected') {
      onDisconnect()
    }
  }, [status, isConnecting, isReconnecting, onDisconnect])
}
