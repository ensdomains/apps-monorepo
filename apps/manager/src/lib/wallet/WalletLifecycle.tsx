import { transactionManager } from '@ens-apps/transaction-manager'
import posthog from 'posthog-js'
import { useEffect } from 'react'
import { useConnection, useConnectionEffect } from 'wagmi'
import { track } from '@/lib/posthog/events'
import { backendAuthStore } from '@/utils/backend-client'

// Disconnect is a full session reset: intentionally evict ALL app localStorage
// so no per-account state (incl. Privy session keys) leaks into the next
// session. Only wagmi.* is preserved — wagmi manages its own connection/
// disconnect state and a blanket clear would corrupt its reconnection.
//
// Privy keys must be cleared here, not left to logout(): logout() failures are
// swallowed upstream, so a stale session would otherwise auto-re-authenticate
// on the next load. The broad sweep also covers any other client state (e.g.
// PostHog) — PostHog is additionally reset explicitly in onDisconnect below.
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
