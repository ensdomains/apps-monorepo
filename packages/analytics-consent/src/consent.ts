/**
 * The visitor's analytics choice, kept only in their own browser.
 *
 * `null` means no choice was made yet and counts as declined: until the
 * visitor accepts, PostHog gets no usage events and no wallet address and
 * stores nothing on their device.
 */

export type AnalyticsConsent = 'accepted' | 'declined'

export type StoredConsent = AnalyticsConsent | null

export const CONSENT_STORAGE_KEY = 'ens.analytics.consent'

/** Same-tab notification: `storage` events only fire in other tabs. */
export const CONSENT_CHANGE_EVENT = 'ens:analytics-consent-change'

const isStoredConsent = (value: unknown): value is AnalyticsConsent =>
  value === 'accepted' || value === 'declined'

export const readConsent = (): StoredConsent => {
  if (typeof localStorage === 'undefined') return null
  const raw = localStorage.getItem(CONSENT_STORAGE_KEY)
  return isStoredConsent(raw) ? raw : null
}

export const writeConsent = (consent: AnalyticsConsent): void => {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(CONSENT_STORAGE_KEY, consent)
}

/** Tell this tab's consent readers the choice changed. */
export const notifyConsentChange = (): void => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(CONSENT_CHANGE_EVENT))
}

/** Persist the choice and notify this tab's readers, synchronously. */
export const setStoredConsent = (consent: AnalyticsConsent): void => {
  writeConsent(consent)
  notifyConsentChange()
}
