import { transactionManager } from '@ens-apps/transaction-manager'
import posthog from 'posthog-js/dist/module.full.no-external'
import { useEffect } from 'react'
import { useConnection, useConnectionEffect } from 'wagmi'
import { track } from '@/lib/posthog/events'
import { backendAuthStore } from '@/utils/backend-client'

// Disconnect is a full session reset: evict app localStorage so no per-account
// state leaks into the next session. Two prefixes survive.
//
// `wagmi`: wagmi manages its own connection/disconnect state and a blanket
// clear would corrupt its reconnection.
//
// `ens-session`: a valid, non-expired scoped HCA session must survive
// disconnect/reconnect so the next registration reuses it with ZERO wallet
// prompts (per the HCA handoff doc). Wiping it forced a re-ENABLE on every
// reconnect. Cross-owner safety is handled by `removeSessionsByOwner` on an
// actual owner switch, and each session is owner+chain+HCA scoped and
// on-chain-expiring, so keeping it across a disconnect is safe.
//
// Privy keys are NOT preserved, and must be cleared here rather than left to
// logout(): logout() failures are swallowed upstream, so a stale session would
// otherwise auto-re-authenticate on the next load. The sweep also covers any
// other client state (e.g. PostHog) — PostHog is additionally reset explicitly
// in onDisconnect below.
const PRESERVED_KEY_PREFIXES = ['wagmi', 'ens-session'] as const
const clearAppLocalStorage = () => {
  for (const key of Object.keys(localStorage)) {
    if (PRESERVED_KEY_PREFIXES.some((prefix) => key.startsWith(prefix)))
      continue
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
