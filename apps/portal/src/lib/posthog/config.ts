import {
  ANALYTICS_CONSENT_COOKIE,
  type AnalyticsConsent,
  hasAnalyticsConsent,
  notifyAnalyticsConsent,
} from '@ens-apps/utils/posthog/analyticsConsent'
import type {
  PostHog,
  PostHogConfig,
} from 'posthog-js/dist/module.full.no-external'

// `loaded` gets the SDK's narrower PostHogInterface, so take only what's used.
type ConsentTarget = Pick<
  PostHog,
  | 'get_explicit_consent_status'
  | 'opt_in_capturing'
  | 'opt_out_capturing'
  | 'reset'
  | 'set_config'
> & { readonly __loaded?: boolean }

// Writes an answer to PostHog's consent cookie.
const writeConsent = (client: ConsentTarget, consent: AnalyticsConsent) => {
  if (consent === 'granted')
    client.opt_in_capturing({ captureEventName: false })
  if (consent === 'denied') client.opt_out_capturing()
}

/** Records the visitor's answer. Declining also forgets their identity. */
export const setAnalyticsConsent = (
  client: ConsentTarget,
  granted: boolean,
): void => {
  if (!granted) client.reset()
  writeConsent(client, granted ? 'granted' : 'denied')
  notifyAnalyticsConsent()
}

/** Forgets the visitor's identity. A plain `reset()` deletes their answer too. */
export const resetKeepingConsent = (client: ConsentTarget): void => {
  if (!client.__loaded) return
  const consent = client.get_explicit_consent_status()
  client.reset()
  writeConsent(client, consent)
}

/** Session recording and surveys only run with consent. */
export const applyAnalyticsConsent = (client: ConsentTarget): void => {
  const isGranted = hasAnalyticsConsent(client)
  client.set_config({
    disable_session_recording: !isGranted || import.meta.env.DEV,
    disable_surveys: !isGranted,
  })
}

// Capture stays opted out until the visitor accepts. Feature flags work
// either way.
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
  loaded: (client) => {
    // Runs before the first flag request. A visitor still identified by
    // wallet without consent (from before the banner) becomes anonymous again.
    if (
      !hasAnalyticsConsent(client) &&
      client.get_property('$user_state') === 'identified'
    )
      resetKeepingConsent(client)
    // Writing the answer again renews its cookie, which Safari drops 7 days
    // after it was written.
    writeConsent(client, client.get_explicit_consent_status())
    notifyAnalyticsConsent()
  },
} satisfies Partial<PostHogConfig>
