// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  CONSENT_COOKIE_NAME,
  clearConsentCookie,
  parseConsentValue,
  readConsentCookie,
  writeConsentCookie,
} from './cookie.js'

const clearCookies = async (): Promise<void> => {
  for (const cookie of await cookieStore.getAll()) {
    if (cookie.name) await cookieStore.delete(cookie.name)
  }
}

describe('consent cookie', () => {
  beforeEach(async () => {
    await clearCookies()
  })
  afterEach(async () => {
    await clearCookies()
  })

  it('parses the stored values and rejects the rest', () => {
    expect(parseConsentValue('accepted')).toBe('accepted')
    expect(parseConsentValue('declined')).toBe('declined')
    expect(parseConsentValue(null)).toBeNull()
    expect(parseConsentValue(undefined)).toBeNull()
    expect(parseConsentValue('')).toBeNull()
    expect(parseConsentValue('yes')).toBeNull()
  })

  it('reads null when the cookie is absent', () => {
    expect(readConsentCookie()).toBeNull()
  })

  it('round-trips the choice through the cookie', () => {
    writeConsentCookie('accepted')
    expect(readConsentCookie()).toBe('accepted')
    writeConsentCookie('declined')
    expect(readConsentCookie()).toBe('declined')
  })

  it('ignores other cookies beside it', async () => {
    await cookieStore.set('other', 'value')
    writeConsentCookie('accepted')
    expect(readConsentCookie()).toBe('accepted')
    expect(document.cookie).toContain(`${CONSENT_COOKIE_NAME}=accepted`)
  })

  it('clears a stale mirror', () => {
    writeConsentCookie('accepted')
    expect(readConsentCookie()).toBe('accepted')
    clearConsentCookie()
    expect(readConsentCookie()).toBeNull()
    expect(document.cookie).not.toContain(CONSENT_COOKIE_NAME)
  })
})
