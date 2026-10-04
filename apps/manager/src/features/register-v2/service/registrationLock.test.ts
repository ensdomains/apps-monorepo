import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  acquireRegistrationLock,
  getBlockingRegistration,
  refreshRegistrationLock,
  releaseHolderLocks,
  releaseRegistrationLock,
} from './registrationLock'

const WALLET = '0x1111111111111111111111111111111111111111' as const
const OTHER_WALLET = '0x2222222222222222222222222222222222222222' as const

/** Run as a second tab: same storage, its own stable holder id. */
const asAnotherTab = <T>(run: () => T): T => {
  const held = sessionStorage.getItem('ens-registration-holder')
  sessionStorage.setItem('ens-registration-holder', 'other-tab')
  try {
    return run()
  } finally {
    if (held) sessionStorage.setItem('ens-registration-holder', held)
    else sessionStorage.removeItem('ens-registration-holder')
  }
}

describe('registrationLock', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('lets the first tab through and blocks a second one', () => {
    expect(acquireRegistrationLock(WALLET, 'tab01.eth')).toBe(true)

    asAnotherTab(() => {
      expect(acquireRegistrationLock(WALLET, 'tab02.eth')).toBe(false)
      expect(getBlockingRegistration(WALLET, 'tab02.eth')).toBe('tab01.eth')
    })
  })

  // Re-entrancy is per tab, not per name: the same registration resuming after
  // a reload must pass, a second tab on the same name must not.
  it('is re-entrant for the tab holding it', () => {
    acquireRegistrationLock(WALLET, 'tab01.eth')

    expect(acquireRegistrationLock(WALLET, 'tab01.eth')).toBe(true)
    expect(getBlockingRegistration(WALLET, 'tab01.eth')).toBeNull()
  })

  it('blocks a second tab registering the same name', () => {
    acquireRegistrationLock(WALLET, 'tab01.eth')

    asAnotherTab(() => {
      expect(acquireRegistrationLock(WALLET, 'tab01.eth')).toBe(false)
    })
  })

  // The permit nonce is per wallet, so another wallet must be free to register
  // without evicting the first wallet's claim.
  it('keeps a separate claim per wallet', () => {
    acquireRegistrationLock(WALLET, 'tab01.eth')

    asAnotherTab(() => {
      expect(acquireRegistrationLock(OTHER_WALLET, 'tab02.eth')).toBe(true)
    })

    expect(getBlockingRegistration(WALLET, 'tab01.eth')).toBeNull()

    asAnotherTab(() => {
      expect(acquireRegistrationLock(WALLET, 'tab03.eth')).toBe(false)
    })
  })

  it('is case-insensitive about the wallet', () => {
    acquireRegistrationLock(WALLET, 'tab01.eth')

    asAnotherTab(() => {
      expect(
        acquireRegistrationLock(
          WALLET.toUpperCase() as typeof WALLET,
          'tab02.eth',
        ),
      ).toBe(false)
    })
  })

  it('frees the wallet once released', () => {
    acquireRegistrationLock(WALLET, 'tab01.eth')
    releaseRegistrationLock(WALLET)

    asAnotherTab(() => {
      expect(acquireRegistrationLock(WALLET, 'tab02.eth')).toBe(true)
    })
  })

  it('will not let one tab release another tab’s claim', () => {
    acquireRegistrationLock(WALLET, 'tab01.eth')

    asAnotherTab(() => releaseRegistrationLock(WALLET))

    asAnotherTab(() => {
      expect(getBlockingRegistration(WALLET, 'tab02.eth')).toBe('tab01.eth')
    })
  })

  // A tab that crashes mid-registration must not hold the wallet forever.
  it('treats a holder that stopped refreshing as gone', () => {
    const start = 1_000_000
    acquireRegistrationLock(WALLET, 'tab01.eth', start)

    asAnotherTab(() => {
      expect(acquireRegistrationLock(WALLET, 'tab02.eth', start + 59_000)).toBe(
        false,
      )
      expect(acquireRegistrationLock(WALLET, 'tab02.eth', start + 60_000)).toBe(
        true,
      )
    })
  })

  it('keeps a refreshed holder alive past the stale window', () => {
    const start = 1_000_000
    acquireRegistrationLock(WALLET, 'tab01.eth', start)
    refreshRegistrationLock(WALLET, 'tab01.eth', start + 50_000)

    asAnotherTab(() => {
      expect(acquireRegistrationLock(WALLET, 'tab02.eth', start + 90_000)).toBe(
        false,
      )
    })
  })

  it('ignores a refresh from a tab that does not hold it', () => {
    const start = 1_000_000
    acquireRegistrationLock(WALLET, 'tab01.eth', start)

    asAnotherTab(() =>
      refreshRegistrationLock(WALLET, 'tab02.eth', start + 50_000),
    )

    asAnotherTab(() => {
      expect(acquireRegistrationLock(WALLET, 'tab02.eth', start + 61_000)).toBe(
        true,
      )
    })
  })

  // Same tab, different name: a second registration started while the first
  // commit is still pending shares the tab id but is not the same attempt.
  it('blocks a different name in the same tab', () => {
    acquireRegistrationLock(WALLET, 'tab01.eth')

    expect(acquireRegistrationLock(WALLET, 'tab02.eth')).toBe(false)
    expect(getBlockingRegistration(WALLET, 'tab02.eth')).toBe('tab01.eth')
  })

  it('releases whatever name this tab holds', () => {
    acquireRegistrationLock(WALLET, 'tab01.eth')
    releaseRegistrationLock(WALLET)

    asAnotherTab(() => {
      expect(acquireRegistrationLock(WALLET, 'tab02.eth')).toBe(true)
    })
  })

  // A reload or route change leaves no live registration in this tab, so its
  // claims must not keep blocking it for the stale window.
  it('drops every claim this tab holds and nothing else', () => {
    acquireRegistrationLock(WALLET, 'tab01.eth')
    asAnotherTab(() => acquireRegistrationLock(OTHER_WALLET, 'tab02.eth'))

    releaseHolderLocks()

    expect(acquireRegistrationLock(WALLET, 'tab03.eth')).toBe(true)
    asAnotherTab(() => {
      expect(getBlockingRegistration(OTHER_WALLET, 'tab04.eth')).toBe(
        'tab02.eth',
      )
    })
  })

  // Storage that refuses writes must not turn the guard into a wall.
  it('grants the claim when storage cannot be written', () => {
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })
    try {
      expect(acquireRegistrationLock(WALLET, 'tab01.eth')).toBe(true)
    } finally {
      setItem.mockRestore()
    }
  })

  it('survives corrupt storage', () => {
    localStorage.setItem('ens-registration-locks-v1', 'not json')

    expect(getBlockingRegistration(WALLET, 'tab01.eth')).toBeNull()
    expect(acquireRegistrationLock(WALLET, 'tab01.eth')).toBe(true)
  })
})

/**
 * "Duplicate tab" clones `sessionStorage`, so the copy opens holding the
 * original's holder id: it used to sweep away that tab's live claim on mount
 * and then register alongside it.
 */
describe('claimTabHolderId', () => {
  /** Stands in for the live tab on the other end of the channel. */
  class FakeChannel {
    static answerFor: string | null = null
    private listeners: ((event: MessageEvent<unknown>) => void)[] = []

    addEventListener(
      _type: string,
      listener: (e: MessageEvent<unknown>) => void,
    ) {
      this.listeners.push(listener)
    }

    postMessage(data: unknown) {
      const message = data as { type: string; holderId: string }
      if (message.type !== 'claim') return
      if (message.holderId !== FakeChannel.answerFor) return

      for (const listener of this.listeners) {
        listener({
          data: { type: 'taken', holderId: message.holderId },
        } as MessageEvent<unknown>)
      }
    }
  }

  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.resetModules()
    vi.stubGlobal('BroadcastChannel', FakeChannel)
    FakeChannel.answerFor = null
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps the id when no other tab answers for it', async () => {
    sessionStorage.setItem('ens-registration-holder', 'only-tab')
    const lock = await import('./registrationLock')

    await expect(lock.claimTabHolderId()).resolves.toBe('only-tab')
  })

  it('takes a new id when another tab already answers for it', async () => {
    sessionStorage.setItem('ens-registration-holder', 'original-tab')
    FakeChannel.answerFor = 'original-tab'
    const lock = await import('./registrationLock')

    const holderId = await lock.claimTabHolderId()

    expect(holderId).not.toBe('original-tab')
    expect(sessionStorage.getItem('ens-registration-holder')).toBe(holderId)
  })

  // The bug this exists for: the clone's mount sweep wiped the claim of the
  // tab it was cloned from, which then had no claim to block a third tab.
  it('leaves the original tab’s claim alone once it has a new id', async () => {
    sessionStorage.setItem('ens-registration-holder', 'original-tab')
    localStorage.setItem(
      'ens-registration-locks-v1',
      JSON.stringify({
        [WALLET.toLowerCase()]: {
          name: 'name-one.eth',
          holderId: 'original-tab',
          updatedAt: Date.now(),
        },
      }),
    )
    FakeChannel.answerFor = 'original-tab'
    const lock = await import('./registrationLock')

    await lock.claimTabHolderId()
    lock.releaseHolderLocks()

    expect(lock.getBlockingRegistration(WALLET, 'name-two.eth')).toBe(
      'name-one.eth',
    )
    expect(lock.acquireRegistrationLock(WALLET, 'name-two.eth')).toBe(false)
  })

  it('falls back to the stored id without a broadcast channel', async () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    sessionStorage.setItem('ens-registration-holder', 'only-tab')
    const lock = await import('./registrationLock')

    await expect(lock.claimTabHolderId()).resolves.toBe('only-tab')
  })
})
