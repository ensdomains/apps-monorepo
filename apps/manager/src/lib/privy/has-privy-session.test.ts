import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  cookieStringHasPrivyToken,
  hasStoredPrivySession,
} from './has-privy-session'

describe('cookieStringHasPrivyToken', () => {
  it('returns false for an empty cookie string', () => {
    expect(cookieStringHasPrivyToken('')).toBe(false)
  })

  it('returns true when privy-token has a value', () => {
    expect(cookieStringHasPrivyToken('a=1; privy-token=abc; b=2')).toBe(true)
  })

  it('returns false when privy-token is empty', () => {
    expect(cookieStringHasPrivyToken('privy-token=; b=2')).toBe(false)
  })

  it('does not match a lookalike cookie name', () => {
    expect(cookieStringHasPrivyToken('not-privy-token=abc')).toBe(false)
  })
})

// happy-dom persists document.cookie across tests in a file, so clear between.
const clearCookies = () => {
  for (const entry of document.cookie.split('; ')) {
    const name = entry.split('=')[0]
    if (name) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
    }
  }
}

describe('hasStoredPrivySession', () => {
  beforeEach(clearCookies)
  afterEach(clearCookies)

  it('returns false when no privy-token cookie is set', () => {
    expect(hasStoredPrivySession()).toBe(false)
  })

  it('returns true when the privy-token cookie has a value', () => {
    document.cookie = 'privy-token=eyJhbGc.test.token; path=/'
    expect(hasStoredPrivySession()).toBe(true)
  })

  it('returns false when the privy-token cookie is empty', () => {
    document.cookie = 'privy-token=; path=/'
    expect(hasStoredPrivySession()).toBe(false)
  })

  it('detects the token alongside other cookies', () => {
    document.cookie = 'ens.wallet.address=0xabc; path=/'
    document.cookie = 'privy-token=abc123; path=/'
    expect(hasStoredPrivySession()).toBe(true)
  })

  it('ignores unrelated cookies', () => {
    document.cookie = 'ens.wallet.address=0xabc; path=/'
    document.cookie = 'other-cookie=value; path=/'
    expect(hasStoredPrivySession()).toBe(false)
  })

  // Guards the bug class this whole helper exists for: the session lives in a
  // COOKIE named exactly `privy-token`, not localStorage and not a lookalike.
  it('does not match a cookie that merely contains "privy-token"', () => {
    document.cookie = 'not-privy-token=abc; path=/'
    expect(hasStoredPrivySession()).toBe(false)
  })
})
