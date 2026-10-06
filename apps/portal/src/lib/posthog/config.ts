import type { PostHogConfig } from 'posthog-js/dist/module.full.no-external'

// Temporary launch state: keep flag evaluation and its identity persistence,
// but prevent every analytics event, including identify and flag-read events.
// POSTHOG_LAUNCH_PAUSE restoration entry point (temporary legal/privacy hold):
// 1. Apply the approved consent policy before removing capture suppression.
//    This pause persists opt-out: changing config alone will not opt existing
//    browsers back in. Only call opt_in_capturing() after valid consent.
// 2. Replace this launch config with the approved collection settings. Previous
//    init settings are preserved below as a reference, not a consent solution.
// 3. Search both apps for POSTHOG_LAUNCH_PAUSE to restore the commented wallet,
//    transaction, Intercom correlation, backend header, CSP, and survey sections
//    as appropriate. Each section lists the imports and companion changes.
// 4. Update launch-specific assertions in config.test.ts, provider.test.tsx,
//    csp.test.ts, and Portal's SettingsMenu.test.tsx for the approved behavior.
// Previous SDK init settings:
// capture_pageview: 'history_change',
// disable_session_recording: !!import.meta.env.DEV,
// defaults: '2025-11-30',
// person_profiles: 'identified_only',
export const FEATURE_FLAGS_ONLY_CONFIG = {
  capture_pageview: false,
  capture_pageleave: false,
  autocapture: false,
  capture_dead_clicks: false,
  capture_heatmaps: false,
  capture_performance: false,
  capture_exceptions: false,
  save_campaign_params: false,
  save_referrer: false,
  disable_surveys: true,
  disable_product_tours: true,
  disable_web_experiments: true,
  disable_conversations: true,
  opt_out_capturing_by_default: true,
  // Also protects existing browsers with a persisted capture opt-in.
  // This drops events only; flag/config requests are unaffected.
  before_send: () => null,
  loaded: (client) => client.opt_out_capturing(),
  disable_session_recording: true,
  defaults: '2025-11-30',
  // `never` would make identify() a no-op and break wallet flag targeting.
  // Profile events are blocked by opt-out and before_send instead.
  person_profiles: 'identified_only',
} satisfies Partial<PostHogConfig>
