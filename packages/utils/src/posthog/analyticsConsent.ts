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

export const getAnalyticsConsent = (
  client: ConsentClient,
): AnalyticsConsent | undefined => {
  try {
    return client.__loaded === true
      ? client.get_explicit_consent_status()
      : undefined
  } catch {
    return undefined
  }
}

export const hasAnalyticsConsent = (client: ConsentClient): boolean =>
  getAnalyticsConsent(client) === 'granted'

const listeners = new Set<() => void>()

/** Re-renders `useAnalyticsConsent` once PostHog loads or its answer changes. */
export const notifyAnalyticsConsent = (): void => {
  for (const listener of listeners) listener()
}

let poll: ReturnType<typeof setInterval> | undefined

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  if (listeners.size === 1) {
    window.addEventListener('focus', notifyAnalyticsConsent)
    poll = setInterval(notifyAnalyticsConsent, 5000)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      window.removeEventListener('focus', notifyAnalyticsConsent)
      clearInterval(poll)
      poll = undefined
    }
  }
}

/** PostHog's answer, or undefined until PostHog has loaded. */
export const useAnalyticsConsent = (
  client: ConsentClient,
): AnalyticsConsent | undefined =>
  useSyncExternalStore(
    subscribe,
    () => getAnalyticsConsent(client),
    () => undefined,
  )
