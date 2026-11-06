import {
  applyAnalyticsConsent,
  canCaptureAnalytics,
  SHARED_POSTHOG_CONFIG,
  sanitizeAutomaticProperties,
  writeAnalyticsConsent,
} from '@ens-apps/utils/posthog/analyticsConfiguration'
import {
  ANALYTICS_CONSENT_COOKIE,
  notifyAnalyticsConsent,
} from '@ens-apps/utils/posthog/analyticsConsent'
import { hasMatchingWalletIdentity } from '@ens-apps/utils/posthog/createAnalyticsTracker'
import type { PostHogConfig } from 'posthog-js/dist/module.full.no-external'
import { getConnectedWalletAddress } from './events'

export {
  applyAnalyticsConsent,
  resetKeepingConsent,
  setAnalyticsConsent,
} from '@ens-apps/utils/posthog/analyticsConfiguration'

export const POSTHOG_CONFIG = {
  ...SHARED_POSTHOG_CONFIG,
  autocapture: {
    ...SHARED_POSTHOG_CONFIG.autocapture,
    dom_event_allowlist: ['click'],
  },
  consent_persistence_name: ANALYTICS_CONSENT_COOKIE,
  before_send: (event) => {
    if (!event) return null
    const identity = event.properties.distinct_id
    if (
      typeof identity !== 'string' ||
      !hasMatchingWalletIdentity(
        getConnectedWalletAddress(),
        identity,
        event.event,
      )
    )
      return null
    const env = import.meta.env
    if (
      !canCaptureAnalytics({
        environment: env.VITE_PUBLIC_ANALYTICS_ENV,
        isDevelopment: env.DEV,
        isDebugEnabled: env.VITE_PUBLIC_ANALYTICS_DEBUG === 'true',
        stagingKey: env.VITE_PUBLIC_POSTHOG_STAGING_KEY,
        productionKey: env.VITE_PUBLIC_POSTHOG_KEY,
      })
    )
      return null
    if (event.event === '$autocapture' || event.event === '$exception')
      return null
    return {
      ...event,
      properties: {
        ...sanitizeAutomaticProperties(event.properties),
        source_app: 'explorer',
        environment: env.VITE_PUBLIC_ANALYTICS_ENV,
        analytics_version: 1,
      },
    }
  },
  loaded: (client) => {
    applyAnalyticsConsent(client)
    writeAnalyticsConsent(client, client.get_explicit_consent_status())
    notifyAnalyticsConsent()
  },
} satisfies Partial<PostHogConfig>
