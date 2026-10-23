import { useSyncExternalStore } from 'react'

/** The visitor's answer to the analytics banner. No answer counts as declined. */
export type AnalyticsConsent = 'granted' | 'denied'

/**
 * PostHog keeps the answer in this cookie on the parent domain, so one answer
 * covers every ens.domains app that names it in its PostHog config.
 */
export const ANALYTICS_CONSENT_COOKIE = 'ens_analytics_consent'

/** The part of PostHog that keeps the answer. */
type ConsentClient = {
  get_explicit_consent_status: () => 'granted' | 'denied' | 'pending'
  opt_in_capturing: (options: { captureEventName: false }) => void
  opt_out_capturing: () => void
}

const listeners = new Set<() => void>()
let client: ConsentClient | null = null
// An answer the browser refused to store (cookies blocked) holds for this page.
let unsavedConsent: AnalyticsConsent | null = null
// The answer listeners last heard. Until PostHog loads it reads as declined.
let heardConsent: AnalyticsConsent | null = 'denied'

const readStoredConsent = (): AnalyticsConsent | null => {
  const status = client?.get_explicit_consent_status() ?? 'denied'
  return status === 'pending' ? null : status
}

/** The stored answer, or null before the visitor has answered. */
export const readAnalyticsConsent = (): AnalyticsConsent | null =>
  unsavedConsent ?? readStoredConsent()

export const hasAnalyticsConsent = (): boolean =>
  readAnalyticsConsent() === 'granted'

const notifyIfChanged = () => {
  const consent = readAnalyticsConsent()
  if (consent === heardConsent) return
  heardConsent = consent
  for (const listener of listeners) listener()
}

/** Reads and stores the answer through PostHog once it has loaded. */
export const connectAnalyticsConsent = (loaded: ConsentClient): void => {
  // Other tabs and subdomains change the cookie without an event, so look
  // again whenever this tab gets focus.
  if (!client) window.addEventListener('focus', notifyIfChanged)
  client = loaded
  notifyIfChanged()
}

export const storeAnalyticsConsent = (consent: AnalyticsConsent): void => {
  if (consent === 'granted')
    client?.opt_in_capturing({ captureEventName: false })
  else client?.opt_out_capturing()
  unsavedConsent = readStoredConsent() === consent ? null : consent
  notifyIfChanged()
}

/** Calls `listener` whenever the answer changes, in this tab or another. */
export const subscribeAnalyticsConsent = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// The server can't read the answer. Reading as declined keeps the banner out
// of server-rendered HTML; it shows once PostHog loads if there's no answer.
const readServerConsent = (): AnalyticsConsent | null => 'denied'

export const useAnalyticsConsent = (): AnalyticsConsent | null =>
  useSyncExternalStore(
    subscribeAnalyticsConsent,
    readAnalyticsConsent,
    readServerConsent,
  )
