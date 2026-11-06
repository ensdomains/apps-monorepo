import {
  getAnalyticsConsentRevision,
  hasAnalyticsConsent,
} from '@ens-apps/utils/posthog/analyticsConsent'
import posthog from 'posthog-js/dist/module.full.no-external'
import { startAnalyticsOperation } from './events'

/** Identifies the current consent epoch without persisting any analytics state. */
export const getAnalyticsReadyKey = (): string | undefined => {
  try {
    return hasAnalyticsConsent(posthog)
      ? `${getAnalyticsConsentRevision()}:${posthog.get_distinct_id()}`
      : undefined
  } catch {
    return undefined
  }
}

/** Binds an observed journey to its consenting browser identity. */
export const createAnalyticsFlow = (flowId = crypto.randomUUID()) => ({
  flow_id: flowId,
  readyKey: getAnalyticsReadyKey(),
  ...startAnalyticsOperation(),
})

export type AnalyticsFlow = ReturnType<typeof createAnalyticsFlow>
