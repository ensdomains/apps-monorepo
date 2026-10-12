// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  CONSENT_COOKIE_NAME,
  parseConsentValue,
  readConsentCookie,
  writeConsentCookie,
} from './cookie.js'

const clearCookies = () => {
  for (const cookie of document.cookie.split(';')) {
    const name = cookie.split('=')[0]?.trim() ?? ''
    if (name) {
      // biome-ignore lint/suspicious/noDocumentCookie: test hygiene.
      document.cookie = `${name}=; Max-Age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT`
    }
  }
}

describe('consent cookie', () => {
  beforeEach(() => {
    clearCookies()
  })
  afterEach(() => {
    clearCookies()
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

  it('ignores other cookies beside it', () => {
    // biome-ignore lint/suspicious/noDocumentCookie: test setup.
    document.cookie = 'other=value; Path=/'
    writeConsentCookie('accepted')
    expect(readConsentCookie()).toBe('accepted')
    expect(document.cookie).toContain(`${CONSENT_COOKIE_NAME}=accepted`)
  })
})
