import { describe, expect, it } from 'vitest'
import { shouldRedirectToDashboard } from './shouldRedirectToDashboard'

const base = {
  isConnecting: false,
  isReconnecting: false,
  hasDomains: true,
  domainsQuerySucceeded: true,
  domainsQueryPaused: false,
  forceLanding: false,
}

describe('shouldRedirectToDashboard', () => {
  it('redirects a settled, connected user who has domains', () => {
    expect(shouldRedirectToDashboard(base)).toBe(true)
  })

  it('waits while connecting', () => {
    expect(shouldRedirectToDashboard({ ...base, isConnecting: true })).toBe(
      false,
    )
  })

  it('waits while reconnecting (the reload window)', () => {
    expect(shouldRedirectToDashboard({ ...base, isReconnecting: true })).toBe(
      false,
    )
  })

  it('does not redirect before the domains query has succeeded', () => {
    expect(
      shouldRedirectToDashboard({
        ...base,
        hasDomains: undefined,
        domainsQuerySucceeded: false,
      }),
    ).toBe(false)
  })

  it('does not redirect when the user has no domains', () => {
    expect(shouldRedirectToDashboard({ ...base, hasDomains: false })).toBe(
      false,
    )
  })

  it('does not redirect when the domains query is paused (offline)', () => {
    expect(
      shouldRedirectToDashboard({ ...base, domainsQueryPaused: true }),
    ).toBe(false)
  })

  it('respects ?landing=true (stay on the landing page)', () => {
    expect(shouldRedirectToDashboard({ ...base, forceLanding: true })).toBe(
      false,
    )
  })
})
