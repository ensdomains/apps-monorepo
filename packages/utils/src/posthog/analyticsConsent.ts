import { useSyncExternalStore } from 'react'

/**
 * PostHog keeps the visitor's answer in this cookie on the parent domain, so
 * every ens.domains app that names it in its PostHog config shares one answer.
 */
export const ANALYTICS_CONSENT_COOKIE = 'ens_analytics_consent'
const ANALYTICS_CONSENT_GENERATION_COOKIE = 'ens_analytics_consent_generation'

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

let consentRevision = 0
export const getAnalyticsConsentRevision = (): string | undefined => {
  try {
    if (typeof document === 'undefined') return undefined
    const generation = document.cookie
      .split('; ')
      .find((cookie) =>
        cookie.startsWith(`${ANALYTICS_CONSENT_GENERATION_COOKIE}=`),
      )
    return `${consentRevision}:${generation ?? 'legacy'}`
  } catch {
    return undefined
  }
}

/** Only explicit choices advance the shared generation; SDK loads and resets do not. */
export const recordAnalyticsConsentChoice = (): void => {
  if (typeof document === 'undefined') return
  const { hostname, protocol } = window.location
  const parentDomain = ['ens.domains', 'ens.dev'].find(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
  )
  const domain = parentDomain ? `; Domain=${parentDomain}` : ''
  // Update synchronously so captures in this tick cannot reuse an older consent generation.
  document.cookie = `${ANALYTICS_CONSENT_GENERATION_COOKIE}=${crypto.randomUUID()}; Path=/; Max-Age=31536000; SameSite=Lax${domain}${protocol === 'https:' ? '; Secure' : ''}`
}
export const invalidateAnalyticsOperations = (): void => {
  consentRevision += 1
}

const listeners = new Set<() => void>()

/** Re-renders `useAnalyticsConsent` once PostHog loads or its answer changes. */
export const notifyAnalyticsConsent = (): void => {
  invalidateAnalyticsOperations()
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
    () => getAnalyticsConsent(client),
    () => undefined,
  )
