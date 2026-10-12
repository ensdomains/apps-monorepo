import type { StoredConsent } from '@ens-apps/analytics-consent/consent'
import {
  CONSENT_COOKIE_NAME,
  parseConsentValue,
} from '@ens-apps/analytics-consent/cookie'
import { getCookie } from '@tanstack/react-start/server'

/**
 * The visitor's analytics choice for server-side route guards, mirrored
 * from the browser in a cookie the client writes together with the choice.
 * Missing or unreadable means not accepted.
 */
export const getConsentCookie = (): StoredConsent => {
  try {
    return parseConsentValue(getCookie(CONSENT_COOKIE_NAME))
  } catch {
    return null
  }
}
