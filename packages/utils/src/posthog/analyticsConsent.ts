import { useSyncExternalStore } from 'react'

/** The visitor's answer to the analytics banner. No answer counts as declined. */
export type AnalyticsConsent = 'granted' | 'denied'

export const ANALYTICS_CONSENT_KEY = 'analytics-consent'
const listeners = new Set<() => void>()
// An answer storage refused to save (blocked or full) holds for this page.
let unsavedConsent: AnalyticsConsent | null = null

/** The stored answer, or null before the visitor has answered. */
export const readAnalyticsConsent = (): AnalyticsConsent | null => {
  if (unsavedConsent !== null || typeof window === 'undefined')
    return unsavedConsent
  try {
    const stored = window.localStorage.getItem(ANALYTICS_CONSENT_KEY)
    return stored === 'granted' || stored === 'denied' ? stored : null
  } catch {
    return null
  }
}

export const hasAnalyticsConsent = (): boolean =>
  readAnalyticsConsent() === 'granted'

export const storeAnalyticsConsent = (consent: AnalyticsConsent): void => {
  try {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, consent)
    unsavedConsent = null
  } catch {
    unsavedConsent = consent
  }
  for (const listener of listeners) listener()
}

/** Calls `listener` whenever the answer changes, in this tab or another. */
export const subscribeAnalyticsConsent = (listener: () => void) => {
  // Other tabs' answers arrive as storage events; a null key is a clear().
  const onStorage = (event: StorageEvent) => {
    if (event.key === ANALYTICS_CONSENT_KEY || event.key === null) listener()
  }
  listeners.add(listener)
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
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
