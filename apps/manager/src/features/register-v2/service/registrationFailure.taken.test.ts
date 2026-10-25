import type { Address, PublicClient } from 'viem'
import { zeroAddress } from 'viem'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@ens-apps/smart-account', () => ({
  getDestinationContracts: () => ({ ethRegistry: '0x0' }),
}))

import { isNameTakenByOther } from './registrationFailure'

const ME = '0x1111000000000000000000000000000000000001' as Address
const OTHER = '0x2222000000000000000000000000000000000002' as Address

const check = (readContract: () => Promise<unknown>) =>
  isNameTakenByOther({
    label: 'race',
    owner: ME,
    chainId: 11155111,
    publicClient: { readContract } as unknown as PublicClient,
  })

const state = (status: number, latestOwner: Address) => async () => ({
  status,
  expiry: 0n,
  latestOwner,
  tokenId: 0n,
  resource: 0n,
})

describe('isNameTakenByOther', () => {
  it('is true when another address holds the name', async () => {
    expect(await check(state(2, OTHER))).toBe(true)
  })

  it('is false when we hold it', async () => {
    expect(await check(state(2, ME))).toBe(false)
  })

  it('ignores an expired previous owner', async () => {
    expect(await check(state(0, OTHER))).toBe(false)
  })

  it('is false when nobody holds it', async () => {
    expect(await check(state(2, zeroAddress))).toBe(false)
  })

  it('is false when the read fails', async () => {
    expect(
      await check(async () => {
        throw new Error('rpc down')
      }),
    ).toBe(false)
  })
})
