import {
  applyAnalyticsConsent,
  canCaptureAnalytics,
  clearAnalyticsAttribution,
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

const ANALYTICS_ENVIRONMENT = {
  network: import.meta.env.VITE_ENS_NETWORK,
  isDevelopment: import.meta.env.DEV,
  isDebugEnabled: import.meta.env.VITE_PUBLIC_POSTHOG_DEBUG === 'true',
  projectKey: import.meta.env.VITE_PUBLIC_POSTHOG_KEY,
}

export const IS_ANALYTICS_ENABLED = canCaptureAnalytics(ANALYTICS_ENVIRONMENT)
export const POSTHOG_KEY =
  import.meta.env.VITE_PUBLIC_POSTHOG_KEY?.trim() || undefined

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
      environment: ANALYTICS_ENVIRONMENT,
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
