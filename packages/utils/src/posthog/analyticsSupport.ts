import { hasAnalyticsConsent } from './analyticsConsent'
import type { createAnalyticsTracker } from './createAnalyticsTracker'
import { createIntercomAnalyticsLink } from './intercomLink'
import { hasMatchingWalletIdentity } from './walletIdentity'

/** Reciprocal support linkage waits for the current consenting identity and widget. */
export const createAnalyticsSupportLink = ({
  client,
  isEnabled,
  getWalletAddress,
  getVisitorId,
  update,
  track,
}: {
  readonly client: Parameters<typeof hasAnalyticsConsent>[0] & {
    readonly get_distinct_id: () => string
    readonly setPersonProperties: (
      properties: Readonly<Record<string, unknown>>,
    ) => void
  }
  readonly isEnabled: boolean
  readonly getWalletAddress: () => string | null | undefined
  readonly getVisitorId: () => string | undefined
  readonly update: (properties: { posthog_distinct_id: string }) => void
  readonly track: ReturnType<typeof createAnalyticsTracker>['track']
}) =>
  createIntercomAnalyticsLink({
    getContext: () => {
      if (!isEnabled || !hasAnalyticsConsent(client)) return
      const distinctId = client.get_distinct_id()
      if (!hasMatchingWalletIdentity(getWalletAddress(), distinctId)) return
      return { distinctId, key: distinctId }
    },
    getVisitorId,
    link: ({ distinctId }, visitorId) => {
      update({ posthog_distinct_id: distinctId })
      client.setPersonProperties({ intercom_visitor_id: visitorId })
      track('intercom:booted')
    },
  })
