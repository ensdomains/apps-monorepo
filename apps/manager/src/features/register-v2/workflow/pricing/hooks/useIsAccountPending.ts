import { useHydrated } from '@tanstack/react-router'
import { useConnection } from 'wagmi'
import { useSmartAccountContext } from '@/lib/smart-account/SmartAccountContext'
import { isAccountPending } from '../lib/checkoutAvailability'

/** The wallet isn't known yet on this page; `isAccountConnected` is the route's own notion of connected. */
export const useIsAccountPending = (isAccountConnected: boolean): boolean => {
  const isHydrated = useHydrated()
  const { status } = useConnection()
  const { hasInitialized } = useSmartAccountContext()
  return isAccountPending({
    isHydrated,
    hasInitialized,
    walletStatus: status,
    isAccountConnected,
  })
}
