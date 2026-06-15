import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'
import { isConnectedProfileOwner } from './ProfileView.helpers'

const address = (suffix: string) => `0x${suffix.padStart(40, '0')}` as Address

describe('isConnectedProfileOwner', () => {
  it('matches the profile owner against any connected account address', () => {
    expect(
      isConnectedProfileOwner({
        owner: address('1'),
        walletAddress: address('2'),
        accountAddress: address('1'),
        ownerAddress: address('3'),
      }),
    ).toBe(true)
  })

  it('matches the HCA owner address even when the smart account differs', () => {
    expect(
      isConnectedProfileOwner({
        owner: address('3'),
        walletAddress: address('1'),
        accountAddress: address('2'),
        ownerAddress: address('3'),
      }),
    ).toBe(true)
  })

  it('does not match unrelated connected addresses', () => {
    expect(
      isConnectedProfileOwner({
        owner: address('3'),
        walletAddress: address('1'),
        accountAddress: address('2'),
        ownerAddress: address('4'),
      }),
    ).toBe(false)
  })
})
