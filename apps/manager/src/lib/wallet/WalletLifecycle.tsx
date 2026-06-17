import { transactionManager } from '@ens-apps/transaction-manager'
import posthog from 'posthog-js'
import { useEffect } from 'react'
import { useConnection, useConnectionEffect } from 'wagmi'
import { track } from '@/lib/posthog/events'
import { hasStoredPrivySession } from '@/lib/privy/has-privy-session'
import { backendAuthStore } from '@/utils/backend-client'

// Blanket localStorage.clear() corrupts reconnection: preserve wagmi + privy
// keys (Privy stores its session under both `privy-` and `privy:` keys, and
// privy.logout() clears those itself).
const clearAppLocalStorage = () => {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('wagmi') || key.startsWith('privy')) continue
    localStorage.removeItem(key)
  }
}

/**
 * Cross-cutting wallet lifecycle, keyed on wagmi connection state (vendor-
 * agnostic): drop stale backend auth + transactions on an account switch, and
 * tear everything down on disconnect. Renders nothing.
 */
export const WalletLifecycle = () => {
  const { address } = useConnection()

  // Keyed on `address` so in-place account switches fire too: drop stale backend
  // auth + transactions when the active address differs from the authed one.
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
      // Skip during the Privy reload gap (session still stored → the bridge
      // reconnects). A genuine logout clears the Privy tokens first, so cleanup
      // still runs then. Always false in the RainbowKit build.
      if (hasStoredPrivySession()) return
      transactionManager.clearAllAndPersistence()
      backendAuthStore.trigger.signOut()
      clearAppLocalStorage()
      track('wallet:disconnect')
      posthog.reset()
    },
  })

  return null
}
