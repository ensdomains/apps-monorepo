import {
  ANALYTICS_CONSENT_COOKIE,
  connectAnalyticsConsent,
  hasAnalyticsConsent,
  readAnalyticsConsent,
  storeAnalyticsConsent,
} from '@ens-apps/utils/posthog/analyticsConsent'
import type {
  PostHog,
  PostHogConfig,
} from 'posthog-js/dist/module.full.no-external'

// `loaded` gets the SDK's narrower PostHogInterface, so take only what's used.
type ConsentTarget = Pick<
  PostHog,
  'opt_in_capturing' | 'opt_out_capturing' | 'reset' | 'set_config'
> & { readonly __loaded?: boolean }

/**
 * Lines PostHog up with the visitor's answer. Writing the answer again also
 * renews its cookie, which Safari drops 7 days after it was written.
 */
export const applyAnalyticsConsent = (client: ConsentTarget): void => {
  if (!client.__loaded) return
  const consent = readAnalyticsConsent()
  const isGranted = consent === 'granted'
  if (isGranted) client.opt_in_capturing({ captureEventName: false })
  else if (consent === 'denied') client.opt_out_capturing()
  client.set_config({
    disable_session_recording: !isGranted || import.meta.env.DEV,
    disable_surveys: !isGranted,
  })
}

/** Forgets the visitor's identity. A plain `reset()` deletes their answer too. */
export const resetKeepingConsent = (client: ConsentTarget): void => {
  if (!client.__loaded) return
  const consent = readAnalyticsConsent()
  client.reset()
  if (consent) storeAnalyticsConsent(consent)
}

// Capture stays opted out until the visitor accepts, and every event is
// checked against their answer before it leaves. Feature flags work either way.
export const POSTHOG_CONFIG = {
  capture_pageview: 'history_change',
  // Turned on with consent by applyAnalyticsConsent.
  disable_session_recording: true,
  disable_surveys: true,
  // Neither app uses these.
  disable_product_tours: true,
  disable_web_experiments: true,
  disable_conversations: true,
  defaults: '2025-11-30',
  person_profiles: 'identified_only',
  opt_out_capturing_by_default: true,
  // The answer lives in a cookie on the parent domain (cross_subdomain_cookie
  // is on by default), so the Explorer and the Manager share one answer.
  opt_out_capturing_persistence_type: 'cookie',
  consent_persistence_name: ANALYTICS_CONSENT_COOKIE,
  before_send: (event) => (hasAnalyticsConsent() ? event : null),
  loaded: (client) => {
    connectAnalyticsConsent(client)
    // Runs before the first flag request. A visitor still identified by
    // wallet without consent (from before the banner) becomes anonymous again.
    if (
      !hasAnalyticsConsent() &&
      client.get_property('$user_state') === 'identified'
    )
      resetKeepingConsent(client)
    applyAnalyticsConsent(client)
  },
} satisfies Partial<PostHogConfig>
