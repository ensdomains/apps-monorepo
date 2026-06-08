import { useEffect } from 'react'
import { useConnectionEffect } from 'wagmi'
import { useSmartAccountContext } from '@/lib/smart-account/SmartAccountContext'

/**
 * useOnDisconnected
 *
 * Calls the onDisconnect callback when the wallet disconnects. Listens for the
 * wagmi disconnect event, and additionally waits for the account to finish
 * loading before assuming the wallet is disconnected.
 *
 * @param onDisconnect Callback to call when the wallet is disconnected.
 */
export const useOnDisconnected = (onDisconnect: () => void) => {
  const { isLoading, hasInitialized, isConnected } = useSmartAccountContext()

  // Fallback to event listener to watch for disconnects post load.
  useConnectionEffect({
    onDisconnect,
  })

  useEffect(() => {
    if (!hasInitialized || isLoading) return
    if (!isConnected) {
      onDisconnect()
    }
  }, [hasInitialized, isLoading, isConnected, onDisconnect])
}
