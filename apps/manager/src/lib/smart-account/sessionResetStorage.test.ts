import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearSessionReset,
  readSessionResetNonce,
  saveSessionReset,
} from './sessionResetStorage'

const HCA: Address = '0xabcdef0123456789abcdef0123456789abcdef01'
const OTHER: Address = '0x0000000000000000000000000000000000000002'

describe('sessionResetStorage', () => {
  beforeEach(() => localStorage.clear())

  it('reads back the saved nonce, scoped by chain and account', () => {
    saveSessionReset(11155111, HCA, 3n)

    expect(readSessionResetNonce(11155111, HCA)).toBe(3n)
    expect(
      readSessionResetNonce(
        11155111,
        '0xABCDEF0123456789ABCDEF0123456789ABCDEF01' as Address,
      ),
    ).toBe(3n)
    expect(readSessionResetNonce(1, HCA)).toBeNull()
    expect(readSessionResetNonce(11155111, OTHER)).toBeNull()
  })

  it('clears only the given account', () => {
    saveSessionReset(11155111, HCA, 3n)
    saveSessionReset(11155111, OTHER, 1n)

    clearSessionReset(11155111, HCA)

    expect(readSessionResetNonce(11155111, HCA)).toBeNull()
    expect(readSessionResetNonce(11155111, OTHER)).toBe(1n)
  })

  it('ignores corrupt storage', () => {
    localStorage.setItem('ens-session-reset-v1', '{not json')
    expect(readSessionResetNonce(11155111, HCA)).toBeNull()

    localStorage.setItem(
      'ens-session-reset-v1',
      JSON.stringify({ [`11155111:${HCA}`]: 'abc' }),
    )
    expect(readSessionResetNonce(11155111, HCA)).toBeNull()
  })

  it('keeps a reset for this visit when storage refuses the save', () => {
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })

    saveSessionReset(11155111, HCA, 3n)
    expect(readSessionResetNonce(11155111, HCA)).toBe(3n)

    clearSessionReset(11155111, HCA)
    expect(readSessionResetNonce(11155111, HCA)).toBeNull()

    // Once storage works again, it is the source of truth.
    setItem.mockRestore()
    saveSessionReset(11155111, HCA, 4n)
    expect(localStorage.getItem('ens-session-reset-v1')).toContain('"4"')
    clearSessionReset(11155111, HCA)
  })
})
