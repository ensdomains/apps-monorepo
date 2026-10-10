// @vitest-environment happy-dom
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const WALLET = '0x1111111111111111111111111111111111111111' as const
const HOLDER_KEY = 'ens-registration-holder'
const LOCKS_KEY = 'ens-registration-locks-v1'

type HolderMessage = {
  readonly type: string
  readonly holderId: string
  readonly claimRank?: string
}

/**
 * The other tab, played by the test: answers a claim on `answerFor` the way a
 * settled tab does. Delivered on a later task, like a real broadcast.
 */
class OtherTabChannel {
  static answerFor: string | null = null
  private listeners: readonly ((event: MessageEvent<unknown>) => void)[] = []

  addEventListener(
    _type: string,
    listener: (event: MessageEvent<unknown>) => void,
  ) {
    this.listeners = [...this.listeners, listener]
  }

  postMessage(data: unknown) {
    const message = data as HolderMessage
    if (
      message.type !== 'claim' ||
      message.holderId !== OtherTabChannel.answerFor
    )
      return

    setTimeout(() => {
      for (const listener of this.listeners) {
        listener({
          data: {
            type: 'taken',
            holderId: message.holderId,
            claimRank: message.claimRank,
          },
        } as MessageEvent<unknown>)
      }
    }, 0)
  }
}

const seedClaim = (holderId: string) =>
  localStorage.setItem(
    LOCKS_KEY,
    JSON.stringify({
      [WALLET.toLowerCase()]: {
        name: 'name-one.eth',
        holderId,
        updatedAt: Date.now(),
      },
    }),
  )

const storedClaimHolder = (): string | undefined =>
  (
    JSON.parse(localStorage.getItem(LOCKS_KEY) ?? '{}') as Record<
      string,
      { holderId: string }
    >
  )[WALLET.toLowerCase()]?.holderId

/** Past `CLAIM_REPLY_WINDOW_MS` (250ms): both sweeps have had their turn. */
const afterClaimWindow = () =>
  new Promise((resolve) => setTimeout(resolve, 500))

/** A fresh module graph per test: the holder claim is settled once per tab. */
const loadHook = async () => {
  const { useRegistrationLockSweep } = await import(
    './useRegistrationLockSweep'
  )
  const lock = await import('../service/registrationLock')
  return { useRegistrationLockSweep, lock }
}

/**
 * WEB-1702: the sweep the registration flow runs on mount and unmount. These
 * drive the hook against the real lock module, so the provider's wiring is
 * covered end to end: a duplicated tab must not free the claim of the tab it
 * was cloned from, and a tab on its own must still free its leftover claim.
 */
describe('useRegistrationLockSweep', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.resetModules()
    vi.stubGlobal('BroadcastChannel', OtherTabChannel)
    OtherTabChannel.answerFor = null
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('leaves the original tab’s live claim alone when a duplicated tab mounts', async () => {
    sessionStorage.setItem(HOLDER_KEY, 'original-tab')
    seedClaim('original-tab')
    OtherTabChannel.answerFor = 'original-tab'
    const { useRegistrationLockSweep, lock } = await loadHook()

    renderHook(() => useRegistrationLockSweep())
    await afterClaimWindow()

    expect(storedClaimHolder()).toBe('original-tab')
    expect(lock.acquireRegistrationLock(WALLET, 'name-two.eth')).toBe(false)
    // …because the clone stepped off the id it inherited.
    expect(sessionStorage.getItem(HOLDER_KEY)).not.toBe('original-tab')
  })

  it('leaves it alone when the duplicated tab unmounts inside the claim window', async () => {
    sessionStorage.setItem(HOLDER_KEY, 'original-tab')
    seedClaim('original-tab')
    OtherTabChannel.answerFor = 'original-tab'
    const { useRegistrationLockSweep } = await loadHook()

    const { unmount } = renderHook(() => useRegistrationLockSweep())
    unmount()
    await afterClaimWindow()

    expect(storedClaimHolder()).toBe('original-tab')
  })

  // Positive control: the reason the sweep exists. A reload keeps its id (no
  // other tab answers for it) and frees the claim it left behind.
  it('still frees this tab’s own leftover claim when no other tab holds its id', async () => {
    sessionStorage.setItem(HOLDER_KEY, 'only-tab')
    seedClaim('only-tab')
    const { useRegistrationLockSweep } = await loadHook()

    renderHook(() => useRegistrationLockSweep())

    await waitFor(() => expect(storedClaimHolder()).toBeUndefined())
    expect(sessionStorage.getItem(HOLDER_KEY)).toBe('only-tab')
  })

  it('frees a claim this tab made once the flow unmounts', async () => {
    sessionStorage.setItem(HOLDER_KEY, 'only-tab')
    const { useRegistrationLockSweep, lock } = await loadHook()

    const { unmount } = renderHook(() => useRegistrationLockSweep())
    // Made after the mount sweep was asked for, so that sweep keeps it.
    expect(lock.acquireRegistrationLock(WALLET, 'name-one.eth')).toBe(true)
    await afterClaimWindow()
    expect(storedClaimHolder()).toBe('only-tab')

    unmount()

    await waitFor(() => expect(storedClaimHolder()).toBeUndefined())
  })
})
