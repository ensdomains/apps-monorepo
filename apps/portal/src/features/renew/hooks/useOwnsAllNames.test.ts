import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'
import { ownsAllNames } from './useOwnsAllNames'

const WALLET = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' as Address
const OTHER = '0x2222222222222222222222222222222222222222' as Address

describe('ownsAllNames', () => {
  it('is true when the wallet owns every name, ignoring address case', () => {
    expect(
      ownsAllNames(WALLET, [WALLET, WALLET.toLowerCase() as Address]),
    ).toBe(true)
  })

  it('is false when any name belongs to someone else', () => {
    expect(ownsAllNames(WALLET, [WALLET, OTHER])).toBe(false)
  })

  it('is false while any owner is still unknown', () => {
    expect(ownsAllNames(WALLET, [WALLET, undefined])).toBe(false)
    expect(ownsAllNames(WALLET, [null])).toBe(false)
  })

  it('is false without a connected wallet or without names', () => {
    expect(ownsAllNames(undefined, [WALLET])).toBe(false)
    expect(ownsAllNames(WALLET, [])).toBe(false)
  })
})
