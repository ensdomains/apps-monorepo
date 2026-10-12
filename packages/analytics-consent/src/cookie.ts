import type { AnalyticsConsent, StoredConsent } from './consent.js'

/**
 * The consent cookie mirrors the stored choice so the Manager's server-side
 * route guards can read it: the server cannot read local storage. The client
 * writes it together with the choice; the server treats a missing or
 * unreadable cookie as not accepted.
 */

export const CONSENT_COOKIE_NAME = 'ens.analytics.consent'

const CONSENT_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60

export const parseConsentValue = (
  value: string | null | undefined,
): StoredConsent =>
  value === 'accepted' || value === 'declined' ? value : null

export const writeConsentCookie = (consent: AnalyticsConsent): void => {
  if (typeof document === 'undefined') return
  // biome-ignore lint/suspicious/noDocumentCookie: consent mirror, sync by design.
  document.cookie = `${CONSENT_COOKIE_NAME}=${consent}; Path=/; Max-Age=${CONSENT_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`
}

export const readConsentCookie = (): StoredConsent => {
  if (typeof document === 'undefined') return null
  const raw =
    document.cookie
      .split('; ')
      .find((row) => row.startsWith(`${CONSENT_COOKIE_NAME}=`))
      ?.substring(CONSENT_COOKIE_NAME.length + 1) ?? null
  return parseConsentValue(raw)
}
