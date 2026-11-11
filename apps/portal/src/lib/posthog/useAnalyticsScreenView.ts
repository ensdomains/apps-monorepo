import {
  getAnalyticsConsentRevision,
  useAnalyticsConsent,
} from '@ens-apps/utils/posthog/analyticsConsent'
import { hasMatchingWalletIdentity } from '@ens-apps/utils/posthog/walletIdentity'
import posthog from 'posthog-js/dist/module.full.no-external'
import { useEffect } from 'react'
import { useConnection } from 'wagmi'

/** Observe the current screen after consent and wallet synchronization; never operation outcomes. */
export const useAnalyticsScreenView = (
  isVisible: boolean,
  observe: (identityKey: string) => void,
): void => {
  const consent = useAnalyticsConsent(posthog)
  const { address, status } = useConnection()
  useEffect(() => {
    if (!isVisible || consent !== 'granted') return
    let isCurrent = true
    queueMicrotask(() => {
      if (!isCurrent) return
      try {
        const identity = posthog.get_distinct_id()
        const wallet = status === 'disconnected' ? null : address
        if (hasMatchingWalletIdentity(wallet, identity))
          observe(`${identity}:${getAnalyticsConsentRevision()}`)
      } catch {
        // Optional screen observations cannot interrupt rendering or navigation.
      }
    })
    return () => {
      isCurrent = false
    }
  }, [isVisible, consent, address, status, observe])
}
