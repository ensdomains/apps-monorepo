import {
  applyAnalyticsConsent,
  canCaptureAnalytics,
  clearAnalyticsAttribution,
  getAnalyticsProjectKey,
  prepareAnalyticsEvent,
  SHARED_POSTHOG_CONFIG,
  writeAnalyticsConsent,
} from '@ens-apps/utils/posthog/analyticsConfiguration'
import {
  ANALYTICS_CONSENT_COOKIE,
  notifyAnalyticsConsent,
} from '@ens-apps/utils/posthog/analyticsConsent'
import type { PostHogConfig } from 'posthog-js/dist/module.full.no-external'
import { getConnectedWalletAddress } from './events'

export {
  applyAnalyticsConsent,
  resetKeepingConsent,
  setAnalyticsConsent,
} from '@ens-apps/utils/posthog/analyticsConfiguration'

const getAnalyticsEnvironment = () => ({
  environment: import.meta.env.VITE_PUBLIC_ANALYTICS_ENV,
  isDevelopment: import.meta.env.DEV,
  isDebugEnabled: import.meta.env.VITE_PUBLIC_ANALYTICS_DEBUG === 'true',
  stagingKey: import.meta.env.VITE_PUBLIC_POSTHOG_STAGING_KEY,
  productionKey: import.meta.env.VITE_PUBLIC_POSTHOG_KEY,
})

export const isAnalyticsEnabled = () =>
  canCaptureAnalytics(getAnalyticsEnvironment())
export const getPostHogKey = () =>
  getAnalyticsProjectKey(getAnalyticsEnvironment())

export const POSTHOG_CONFIG = {
  ...SHARED_POSTHOG_CONFIG,
  autocapture: {
    ...SHARED_POSTHOG_CONFIG.autocapture,
    dom_event_allowlist: ['click'],
  },
  consent_persistence_name: ANALYTICS_CONSENT_COOKIE,
  before_send: (event) =>
    prepareAnalyticsEvent(event, {
      sourceApp: 'explorer',
      environment: getAnalyticsEnvironment(),
      walletAddress: getConnectedWalletAddress(),
    }),
  loaded: (
    client: Parameters<typeof applyAnalyticsConsent>[0] &
      Parameters<typeof clearAnalyticsAttribution>[0],
  ) => {
    try {
      clearAnalyticsAttribution(client)
      applyAnalyticsConsent(client)
      writeAnalyticsConsent(client, client.get_explicit_consent_status())
    } catch (error) {
      console.warn('[posthog] loaded consent synchronization failed', error)
    }
    notifyAnalyticsConsent()
  },
} satisfies Partial<PostHogConfig>
