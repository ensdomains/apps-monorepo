import { beforeEach, describe, expect, it } from 'vitest'
import {
  acquireRegistrationLock,
  getBlockingRegistration,
  refreshRegistrationLock,
  releaseRegistrationLock,
} from './registrationLock'

const WALLET = '0x1111111111111111111111111111111111111111' as const
const OTHER_WALLET = '0x2222222222222222222222222222222222222222' as const

describe('registrationLock', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('lets the first name through and blocks a second one', () => {
    expect(acquireRegistrationLock(WALLET, 'tab01.eth')).toBe(true)
    expect(acquireRegistrationLock(WALLET, 'tab02.eth')).toBe(false)
    expect(getBlockingRegistration(WALLET, 'tab02.eth')).toBe('tab01.eth')
  })

  // The same registration resuming after a reload must not lock itself out.
  it('is re-entrant for the name holding it', () => {
    acquireRegistrationLock(WALLET, 'tab01.eth')

    expect(acquireRegistrationLock(WALLET, 'tab01.eth')).toBe(true)
    expect(getBlockingRegistration(WALLET, 'tab01.eth')).toBeNull()
  })

  // The permit nonce is per wallet, so a different wallet is unaffected.
  it('does not block a different wallet', () => {
    acquireRegistrationLock(WALLET, 'tab01.eth')

    expect(acquireRegistrationLock(OTHER_WALLET, 'tab02.eth')).toBe(true)
  })

  it('is case-insensitive about the wallet', () => {
    acquireRegistrationLock(WALLET, 'tab01.eth')

    expect(
      acquireRegistrationLock(
        WALLET.toUpperCase() as typeof WALLET,
        'tab02.eth',
      ),
    ).toBe(false)
  })

  it('frees the wallet once released', () => {
    acquireRegistrationLock(WALLET, 'tab01.eth')
    releaseRegistrationLock(WALLET, 'tab01.eth')

    expect(acquireRegistrationLock(WALLET, 'tab02.eth')).toBe(true)
  })

  it('leaves a lock held by another name alone on release', () => {
    acquireRegistrationLock(WALLET, 'tab01.eth')
    releaseRegistrationLock(WALLET, 'tab02.eth')

    expect(getBlockingRegistration(WALLET, 'tab02.eth')).toBe('tab01.eth')
  })

  // A tab that crashes mid-registration must not hold the wallet forever.
  it('treats a holder that stopped refreshing as gone', () => {
    const start = 1_000_000
    acquireRegistrationLock(WALLET, 'tab01.eth', start)

    expect(acquireRegistrationLock(WALLET, 'tab02.eth', start + 59_000)).toBe(
      false,
    )
    expect(acquireRegistrationLock(WALLET, 'tab02.eth', start + 60_000)).toBe(
      true,
    )
  })

  it('keeps a refreshed holder alive past the stale window', () => {
    const start = 1_000_000
    acquireRegistrationLock(WALLET, 'tab01.eth', start)
    refreshRegistrationLock(WALLET, 'tab01.eth', start + 50_000)

    expect(acquireRegistrationLock(WALLET, 'tab02.eth', start + 90_000)).toBe(
      false,
    )
  })

  it('ignores a refresh from a name that does not hold it', () => {
    const start = 1_000_000
    acquireRegistrationLock(WALLET, 'tab01.eth', start)
    refreshRegistrationLock(WALLET, 'tab02.eth', start + 50_000)

    expect(acquireRegistrationLock(WALLET, 'tab02.eth', start + 61_000)).toBe(
      true,
    )
  })

  it('survives corrupt storage', () => {
    localStorage.setItem('ens-registration-lock-v1', 'not json')

    expect(getBlockingRegistration(WALLET, 'tab01.eth')).toBeNull()
    expect(acquireRegistrationLock(WALLET, 'tab01.eth')).toBe(true)
  })
})
