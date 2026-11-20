import { expect, it } from 'vitest'
import { getAnalyticsConsent, hasAnalyticsConsent } from './analyticsConsent'

it('treats an unavailable SDK consent read as unknown and disables capture', () => {
  const client = {
    __loaded: true,
    get_explicit_consent_status: () => {
      throw new Error('SDK unavailable')
    },
  }

  expect(getAnalyticsConsent(client)).toBeUndefined()
  expect(hasAnalyticsConsent(client)).toBe(false)
})

it('does not consult the SDK until loaded', () => {
  const client = {
    __loaded: false,
    get_explicit_consent_status: () => {
      throw new Error('Consent read before initialization')
    },
  }

  expect(getAnalyticsConsent(client)).toBeUndefined()
  expect(hasAnalyticsConsent(client)).toBe(false)
})
