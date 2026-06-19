import { transactionManager } from '@ens-apps/transaction-manager'
import posthog from 'posthog-js'
import { useEffect } from 'react'
import { useConnection, useConnectionEffect } from 'wagmi'
import { track } from '@/lib/posthog/events'
import { backendAuthStore } from '@/utils/backend-client'

// Blanket localStorage.clear() corrupts reconnection, so preserve wagmi.* (wagmi
// manages its own disconnect state). Privy keys ARE cleared: this runs on
// disconnect after logout(), and since logout() failures are swallowed upstream
// we must clear them ourselves or a stale session auto-re-authenticates on the
// next load.
const clearAppLocalStorage = () => {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('wagmi')) continue
    localStorage.removeItem(key)
  }
}

// Drops stale backend auth + transactions on an account switch, and tears
// everything down on disconnect. Renders nothing.
export const WalletLifecycle = () => {
  const { address } = useConnection()

  useEffect(() => {
    if (!address) return

    const authedAddress = backendAuthStore.get().context.address
    if (
      authedAddress &&
      authedAddress.toLowerCase() !== address.toLowerCase()
    ) {
      transactionManager.clearAllAndPersistence()
      backendAuthStore.trigger.signOut()
    }
  }, [address])

  useConnectionEffect({
    onDisconnect() {
      transactionManager.clearAllAndPersistence()
      backendAuthStore.trigger.signOut()
      clearAppLocalStorage()
      track('wallet:disconnect')
      posthog.reset()
    },
  })

  return null
}
