import type {
  BeforeSendFn,
  PostHogConfig,
} from 'posthog-js/dist/module.full.no-external'
import { readConsent, type StoredConsent } from './consent.js'

/**
 * The PostHog settings that go with each consent choice.
 *
 * Both modes share the collection allowlist: page visits, the usage events
 * the apps define, wallet connect and disconnect, and the wallet address as
 * identity. Recordings, automatic capture, surveys, error reports and the
 * support-chat link-up stay off in both. The modes differ only in whether
 * the SDK may capture and persist at all.
 *
 * Verified against posthog-js 1.404.1 (see posthog.test.ts):
 * - anonymous init sends only the config request and anonymous flag
 *   requests, and stores nothing;
 * - `opt_in_capturing()` starts capture at once with a page view;
 * - `before_send` runs at capture time, so `request_batching: false` is
 *   what keeps a queued event from flushing after a decline;
 * - `reset()` clears the opt-out state, so it must precede `opt_out`.
 */

export const beforeSendIfConsented: BeforeSendFn = (event) =>
  event && readConsent() === 'accepted' ? event : null

const ANALYTICS_BASE_CONFIG = {
  capture_pageview: 'history_change',
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
  disable_session_recording: true,
  person_profiles: 'identified_only',
  defaults: '2025-11-30',
  // Events send at once instead of waiting on a flush timer, so nothing
  // captured while accepted can arrive after a decline.
  request_batching: false,
  before_send: beforeSendIfConsented,
} satisfies Partial<PostHogConfig>

export const ANONYMOUS_POSTHOG_CONFIG = {
  ...ANALYTICS_BASE_CONFIG,
  opt_out_capturing_by_default: true,
  opt_out_persistence_by_default: true,
} satisfies Partial<PostHogConfig>

export const CONSENTED_POSTHOG_CONFIG = {
  ...ANALYTICS_BASE_CONFIG,
} satisfies Partial<PostHogConfig>

/** No choice counts as declined. */
export const configForConsent = (
  consent: StoredConsent,
): Partial<PostHogConfig> =>
  consent === 'accepted' ? CONSENTED_POSTHOG_CONFIG : ANONYMOUS_POSTHOG_CONFIG

const POSTHOG_KEY_PREFIXES = ['ph_', '__ph_'] as const

const isPosthogKey = (name: string): boolean =>
  POSTHOG_KEY_PREFIXES.some((prefix) => name.startsWith(prefix))

/**
 * Remove everything PostHog stored on this device: identities, capture
 * state and flag overrides. Run before an anonymous init so a stale
 * opt-in or a pre-pause wallet identity cannot leak into it, and after a
 * decline so the anonymous storage expectation holds again. After the
 * sweep the SDK falls back to the anonymous init defaults.
 */
export const sweepPosthogStorage = (): void => {
  if (typeof localStorage !== 'undefined') {
    for (const key of Object.keys(localStorage)) {
      if (isPosthogKey(key)) localStorage.removeItem(key)
    }
  }
  if (typeof sessionStorage !== 'undefined') {
    for (const key of Object.keys(sessionStorage)) {
      if (isPosthogKey(key)) sessionStorage.removeItem(key)
    }
  }
  if (typeof document !== 'undefined') {
    sweepPosthogCookies()
  }
}

const sweepPosthogCookies = (): void => {
  for (const cookie of document.cookie.split(';')) {
    const name = cookie.split('=')[0]?.trim() ?? ''
    if (!isPosthogKey(name)) continue
    // biome-ignore lint/suspicious/noDocumentCookie: consent sweep, sync by design.
    document.cookie = `${name}=; Path=/; Max-Age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`
  }
}

/** The slice of the PostHog client the consent transitions drive. */
export type AnalyticsClient = {
  readonly opt_in_capturing: () => void
  readonly opt_out_capturing: () => void
  readonly reset: () => void
  readonly identify: (
    distinctId: string,
    properties?: Record<string, unknown>,
    onceProperties?: Record<string, unknown>,
  ) => void
}

/** The caller persists the choice first; the guard reads it. */
export const applyAcceptedConsent = (
  client: AnalyticsClient,
  walletAddress?: string | null,
): void => {
  client.opt_in_capturing()
  if (walletAddress) {
    client.identify(
      walletAddress,
      { address: walletAddress },
      { initial_address: walletAddress },
    )
  }
}

/** The caller persists the choice first; the guard reads it. */
export const applyDeclinedConsent = (client: AnalyticsClient): void => {
  client.reset()
  client.opt_out_capturing()
  sweepPosthogStorage()
}
