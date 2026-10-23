import { useSyncExternalStore } from 'react'

/** The visitor's answer to the analytics banner. No answer counts as declined. */
export type AnalyticsConsent = 'granted' | 'denied'

const ANALYTICS_CONSENT_KEY = 'analytics-consent'
const listeners = new Set<() => void>()
// Keeps the answer for this page when storage is blocked.
let pageConsent: AnalyticsConsent | null = null

/** The stored answer, or null before the visitor has answered. */
export const readAnalyticsConsent = (): AnalyticsConsent | null => {
  if (typeof window === 'undefined') return null
  try {
    const stored = window.localStorage.getItem(ANALYTICS_CONSENT_KEY)
    return stored === 'granted' || stored === 'denied' ? stored : null
  } catch {
    return pageConsent
  }
}

export const hasAnalyticsConsent = (): boolean =>
  readAnalyticsConsent() === 'granted'

export const storeAnalyticsConsent = (consent: AnalyticsConsent): void => {
  pageConsent = consent
  try {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, consent)
  } catch {
    // Blocked storage: the answer lasts for this page only.
  }
  for (const listener of listeners) listener()
}

/** Calls `listener` whenever the visitor answers. Returns the unsubscribe. */
export const subscribeAnalyticsConsent = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// The server can't read storage. Reading as declined keeps the banner out of
// server-rendered HTML; hydration shows it if the visitor hasn't answered.
const readServerConsent = (): AnalyticsConsent | null => 'denied'

export const useAnalyticsConsent = (): AnalyticsConsent | null =>
  useSyncExternalStore(
    subscribeAnalyticsConsent,
    readAnalyticsConsent,
    readServerConsent,
  )
