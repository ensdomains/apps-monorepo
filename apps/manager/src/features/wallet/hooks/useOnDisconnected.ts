import { useEffect } from 'react'
import { useParaLogoutEffect } from '@/lib/para'
import { useSmartAccountContext } from '@/lib/smart-account/SmartAccountContext'

/**
 * useOnDisconnected
 *
 * Effect that listens for the Para logout event and calls the onDisconnect function.
 * Additionally it waits for the account to finish loading before assuming the wallet is disconnected.
 *
 * If the account is not connected, it will call the onDisconnect function.
 *
 * @param onDisconnect Callback to call when the wallet is disconnected.
 */
export const useOnDisconnected = (onDisconnect: () => void) => {
  const { isLoading, hasInitialized, isConnected } = useSmartAccountContext()

  // Fallback to event listener to watch for disconnects post load.
  useParaLogoutEffect(() => {
    onDisconnect()
  })

  useEffect(() => {
    if (!hasInitialized || isLoading) return
    if (!isConnected) {
      onDisconnect()
    }
  }, [hasInitialized, isLoading, isConnected, onDisconnect])
}
