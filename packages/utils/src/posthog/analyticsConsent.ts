import { useSyncExternalStore } from 'react'

/**
 * PostHog keeps the visitor's answer in this cookie on the parent domain, so
 * every ens.domains app that names it in its PostHog config shares one answer.
 */
export const ANALYTICS_CONSENT_COOKIE = 'ens_analytics_consent'

/** PostHog's answer to the analytics banner. */
export type AnalyticsConsent = 'granted' | 'denied' | 'pending'

type ConsentClient = {
  readonly __loaded?: boolean
  get_explicit_consent_status: () => AnalyticsConsent
}

export const hasAnalyticsConsent = (client: ConsentClient): boolean =>
  client.__loaded === true && client.get_explicit_consent_status() === 'granted'

const listeners = new Set<() => void>()

/** Re-renders `useAnalyticsConsent` once PostHog loads or its answer changes. */
export const notifyAnalyticsConsent = (): void => {
  for (const listener of listeners) listener()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  // Another tab or ens.domains app can answer, and cookies fire no event, so
  // look again on focus and every few seconds, well before PostHog's 5-minute
  // flag refresh could send an identity the visitor has since declined.
  window.addEventListener('focus', listener)
  const poll = setInterval(listener, 5000)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('focus', listener)
    clearInterval(poll)
  }
}

/** PostHog's answer, or undefined until PostHog has loaded. */
export const useAnalyticsConsent = (
  client: ConsentClient,
): AnalyticsConsent | undefined =>
  useSyncExternalStore(
    subscribe,
    () => (client.__loaded ? client.get_explicit_consent_status() : undefined),
    () => undefined,
  )
