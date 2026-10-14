import type {
  BeforeSendFn,
  PostHogConfig,
} from 'posthog-js/dist/module.full.no-external'
import { readConsent } from './consent.js'
import { writeCookieSync } from './cookie.js'

/**
 * The PostHog settings for analytics with consent.
 *
 * The SDK always starts in the anonymous mode below, whatever the stored
 * choice; an accepted choice opts in at runtime right after init. The
 * collection allowlist: page visits, the usage events the apps define,
 * wallet connect and disconnect, and the wallet address as identity.
 * Recordings, automatic capture, surveys, error reports and the
 * support-chat link-up stay off. A decline ends with no marker in
 * storage, so the opt-out status falls back to the init defaults, which
 * is why init is always anonymous: starting consented left the SDK
 * opted in with fresh storage after a decline.
 *
 * Verified against posthog-js 1.404.1 (see posthog.test.ts):
 * - anonymous init sends only the config request and anonymous flag
 *   requests, and stores nothing;
 * - `opt_in_capturing()` starts capture at once with a page view;
 * - `before_send` runs at capture time, so `request_batching: false` is
 *   what keeps a queued event from flushing after a decline;
 * - decline after a runtime opt-in keeps the opt-out through a later
 *   reset, with clean storage and no wallet in any request.
 */

/**
 * Implicit events the SDK emits on its own that fall outside the accepted
 * collection: every feature-flag read phones home with the visitor's
 * identity. Filtered centrally so all present and future flag reads are
 * covered; evaluation itself is unaffected.
 */
const SUPPRESSED_SDK_EVENTS: ReadonlySet<string> = new Set([
  '$feature_flag_called',
])

export const beforeSendIfConsented: BeforeSendFn = (event) => {
  if (!event) return null
  if (SUPPRESSED_SDK_EVENTS.has(event.event)) return null
  return readConsent() === 'accepted' ? event : null
}

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
  // Cookies stay host-scoped: each app holds its own choice, and the sweep
  // below can only complete what it can address. The SDK defaults to
  // parent-domain cookies, which a Path-only deletion cannot remove.
  cross_subdomain_cookie: false,
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

/**
 * Deletion strings for one PostHog cookie, covering how the SDK writes
 * them: host-only or parent-domain (its default), plain or Secure (its
 * default on HTTPS). Stale cookies from earlier builds predate the
 * host-only setting, so every variant is always attempted; inapplicable
 * ones are ignored.
 */
export const posthogCookieDeletions = (
  hostname: string,
  name: string,
): readonly string[] => {
  const labels = hostname.split('.')
  const domains: readonly string[] =
    labels.length > 1 ? ['', `; Domain=.${labels.slice(-2).join('.')}`] : ['']
  return domains.flatMap((domain) => [
    `${name}=; Path=/${domain}; Max-Age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`,
    `${name}=; Path=/${domain}; Max-Age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax; Secure`,
  ])
}

const sweepPosthogCookies = (): void => {
  const { hostname } = window.location
  for (const cookie of document.cookie.split(';')) {
    const name = cookie.split('=')[0]?.trim() ?? ''
    if (!isPosthogKey(name)) continue
    for (const deletion of posthogCookieDeletions(hostname, name)) {
      writeCookieSync(deletion)
    }
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
  readonly register: (properties: Record<string, unknown>) => void
}

export type WalletConnection = {
  readonly address: string
  readonly chainId: number
  readonly connectorName: string
}

/** Pair the wallet address as identity with the wallet super-properties. */
export const identifyWalletConnection = (
  client: AnalyticsClient,
  wallet: WalletConnection,
): void => {
  client.identify(
    wallet.address,
    { address: wallet.address },
    { initial_address: wallet.address },
  )
  client.register({
    wallet_address: wallet.address,
    chain_id: wallet.chainId,
    wallet_connector: wallet.connectorName,
  })
}

/**
 * Stop capture and drop the wallet identity, then sweep PostHog storage so
 * the anonymous expectation holds again. The caller persists the choice
 * first; the guard reads it. Order matters: reset() clears the opt-out
 * state, so it must precede opt_out_capturing().
 */
export const applyDeclinedConsent = (client: AnalyticsClient): void => {
  client.reset()
  client.opt_out_capturing()
  sweepPosthogStorage()
}
