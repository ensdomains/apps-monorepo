import { useEffect } from 'react'
import { useAccount } from 'wagmi'
import { useSmartAccountContext } from '@/lib/smart-account/SmartAccountContext'

/**
 * useOnDisconnected
 *
 * Effect that waits for the wallet and smart-account state to settle before
 * assuming the wallet is disconnected.
 *
 * If the account is not connected, it will call the onDisconnect function.
 *
 * @param onDisconnect Callback to call when the wallet is disconnected.
 */
export const useOnDisconnected = (onDisconnect: () => void) => {
  const { isLoading, hasInitialized, isConnected } = useSmartAccountContext()
  const { status } = useAccount()

  useEffect(() => {
    if (!hasInitialized || isLoading) return
    if (status === 'connecting' || status === 'reconnecting') return
    if (!isConnected) {
      onDisconnect()
    }
  }, [hasInitialized, isLoading, isConnected, onDisconnect, status])
}
