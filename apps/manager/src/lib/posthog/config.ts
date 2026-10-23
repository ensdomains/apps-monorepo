import { hasAnalyticsConsent } from '@ens-apps/utils/posthog/analyticsConsent'
import type {
  PostHog,
  PostHogConfig,
} from 'posthog-js/dist/module.full.no-external'

// `loaded` gets the SDK's narrower PostHogInterface, so take only what's used.
type ConsentTarget = Pick<
  PostHog,
  'opt_in_capturing' | 'opt_out_capturing' | 'set_config'
> & { readonly __loaded?: boolean }

/**
 * Lines PostHog up with the visitor's answer to the analytics banner. Call it
 * again after `reset()`, which drops the opt-in.
 */
export const applyAnalyticsConsent = (client: ConsentTarget): void => {
  if (!client.__loaded) return
  const isGranted = hasAnalyticsConsent()
  if (isGranted) client.opt_in_capturing({ captureEventName: false })
  else client.opt_out_capturing()
  client.set_config({
    disable_session_recording: !isGranted || import.meta.env.DEV,
    disable_surveys: !isGranted,
  })
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
  before_send: (event) => (hasAnalyticsConsent() ? event : null),
  loaded: (client) => {
    // Runs before the first flag request. A visitor still identified by
    // wallet without consent (from before the banner) becomes anonymous again.
    if (
      !hasAnalyticsConsent() &&
      client.get_property('$user_state') === 'identified'
    )
      client.reset()
    applyAnalyticsConsent(client)
  },
} satisfies Partial<PostHogConfig>
