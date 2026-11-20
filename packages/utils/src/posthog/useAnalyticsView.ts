import { useEffect } from 'react'
import { useAnalyticsConsent } from './analyticsConsent'
import { hasMatchingWalletIdentity } from './walletIdentity'

type Client = Parameters<typeof useAnalyticsConsent>[0] & {
  readonly get_distinct_id: () => string
}

/** Current-screen readiness only; operation outcomes belong to their services. */
export const useAnalyticsView = (
  client: Client,
  wallet: string | null | undefined,
  isVisible: boolean,
  observe: (identity: string) => void,
  subscribe?: (listener: () => void) => { readonly unsubscribe: () => void },
): void => {
  const consent = useAnalyticsConsent(client)
  useEffect(() => {
    if (!isVisible || consent !== 'granted') return
    let isCurrent = true
    const report = () => {
      if (!isCurrent) return
      try {
        const identity = client.get_distinct_id()
        if (hasMatchingWalletIdentity(wallet, identity)) observe(identity)
      } catch {
        // Optional observations cannot interrupt rendering or actor notifications.
      }
    }
    queueMicrotask(report)
    const subscription = subscribe?.(report)
    return () => {
      isCurrent = false
      subscription?.unsubscribe()
    }
  }, [client, wallet, isVisible, consent, observe, subscribe])
}
