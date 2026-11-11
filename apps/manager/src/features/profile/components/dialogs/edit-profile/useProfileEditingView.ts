import {
  getAnalyticsConsentRevision,
  useAnalyticsConsent,
} from '@ens-apps/utils/posthog/analyticsConsent'
import { hasMatchingWalletIdentity } from '@ens-apps/utils/posthog/walletIdentity'
import posthog from 'posthog-js/dist/module.full.no-external'
import { useEffect } from 'react'
import { useConnection } from 'wagmi'
import type { Actor } from 'xstate'
import type { editProfileDialogMachine } from './EditProfileDialog.machine'

/** Observe only the current editor after SDK/consent readiness; write results never use this effect. */
export const useProfileEditingView = (
  actor: Actor<typeof editProfileDialogMachine>,
  isVisible: boolean,
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
          actor
            .getSnapshot()
            .context.analytics.view(
              `${identity}:${getAnalyticsConsentRevision()}`,
            )
      } catch {
        // Optional screen observation cannot interrupt the editor.
      }
    })
    return () => {
      isCurrent = false
    }
  }, [actor, isVisible, consent, address, status])
}
