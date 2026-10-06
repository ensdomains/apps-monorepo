import { errAsync, okAsync } from 'neverthrow'
import { labelhash, zeroAddress } from 'viem'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MS_PER_DAY,
  V2_GRACE_PERIOD_DAYS,
} from '@/features/grace/utils/gracePeriod'
import { isConnectedProfileOwner } from '@/features/profile/components/view/connectedAccounts.helpers'
import { shouldShowThirdPartyRenewalWarning } from '@/features/renew/utils/thirdPartyRenewalWarning'

const mocks = vi.hoisted(() => ({
  client: {},
  getV1Owner: vi.fn(),
  getV2Owner: vi.fn(),
  getNameDetail: vi.fn(),
  readContract: vi.fn(),
}))

vi.mock('@/features/shared/service/nameDetail', () => ({
  getNameDetail: mocks.getNameDetail,
}))

vi.mock('@ensdomains/ensjs/public/v1', () => ({
  getOwner: mocks.getV1Owner,
}))

vi.mock('@ensdomains/ensjs/public/v2', () => ({
  getOwner: mocks.getV2Owner,
}))

vi.mock('viem/actions', () => ({
  readContract: mocks.readContract,
}))

vi.mock('@/lib/wagmi/helpers', async () => {
  const { ok } = await import('neverthrow')
  return {
    safeGetClient: () => ok(mocks.client),
  }
})

import { getOwner } from './profileOwner'

const previousOwner = '0x0000000000000000000000000000000000000002'
const expiryDate = new Date('2026-07-01T00:00:00Z')
const expiry = BigInt(expiryDate.getTime() / 1000)

describe('getOwner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(expiryDate.getTime() + MS_PER_DAY)
    mocks.getV2Owner.mockResolvedValue(null)
    mocks.getNameDetail.mockReturnValue(okAsync(null))
    mocks.getV1Owner.mockResolvedValue(null)
    mocks.readContract.mockResolvedValue({
      expiry,
      latestOwner: previousOwner,
      resource: 0n,
      status: 0,
      tokenId: 0n,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns V2 ownership without querying V1', async () => {
    mocks.getV2Owner.mockResolvedValue(
      '0x0000000000000000000000000000000000000002',
    )

    const result = await getOwner({ name: 'figma.eth' })

    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap()).toEqual({
      owner: '0x0000000000000000000000000000000000000002',
      protocol: 'v2',
    })
    expect(mocks.getNameDetail).not.toHaveBeenCalled()
    expect(mocks.getV1Owner).not.toHaveBeenCalled()
    expect(mocks.readContract).not.toHaveBeenCalled()
  })

  it('recovers the on-chain owner of a V2 registration during grace', async () => {
    mocks.getV2Owner.mockResolvedValue(zeroAddress)
    mocks.getNameDetail.mockReturnValue(okAsync({ protocol: 'v2' }))

    // Legacy registry ownership can remain after a name has migrated to V2.
    mocks.getV1Owner.mockResolvedValue({
      owner: '0x0000000000000000000000000000000000000001',
      registrant: null,
      ownershipLevel: 'registrar',
    })

    const result = await getOwner({ name: 'gloomy.eth' })

    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap()).toEqual({
      owner: previousOwner,
      protocol: 'v2',
    })
    expect(mocks.getNameDetail).toHaveBeenCalledWith('gloomy.eth')
    expect(mocks.getV1Owner).not.toHaveBeenCalled()
    expect(mocks.readContract).toHaveBeenCalledWith(
      mocks.client,
      expect.objectContaining({
        functionName: 'getState',
        args: [BigInt(labelhash('gloomy'))],
      }),
    )
  })

  it.each([
    'walletAddress',
    'accountAddress',
    'ownerAddress',
  ] as const)('recognises the previous owner through %s without a third-party warning', async (addressKey) => {
    mocks.getNameDetail.mockReturnValue(okAsync({ protocol: 'v2' }))

    const result = await getOwner({ name: 'gloomy.eth' })
    const owner = result._unsafeUnwrap()?.owner
    const isOwner = isConnectedProfileOwner({
      owner,
      walletAddress: undefined,
      accountAddress: null,
      ownerAddress: null,
      [addressKey]: previousOwner,
    })

    expect(isOwner).toBe(true)
    expect(shouldShowThirdPartyRenewalWarning(isOwner)).toBe(false)
    expect(
      shouldShowThirdPartyRenewalWarning(
        isConnectedProfileOwner({
          owner,
          walletAddress: '0x0000000000000000000000000000000000000003',
          accountAddress: null,
          ownerAddress: null,
        }),
      ),
    ).toBe(true)
  })

  it.each([
    { elapsed: 1, ownsName: true },
    { elapsed: V2_GRACE_PERIOD_DAYS * MS_PER_DAY - 1, ownsName: true },
    { elapsed: V2_GRACE_PERIOD_DAYS * MS_PER_DAY, ownsName: false },
    { elapsed: (V2_GRACE_PERIOD_DAYS + 1) * MS_PER_DAY, ownsName: false },
  ])('limits previous ownership at expiry + $elapsed ms', async ({
    elapsed,
    ownsName,
  }) => {
    vi.setSystemTime(expiryDate.getTime() + elapsed)
    mocks.getNameDetail.mockReturnValue(okAsync({ protocol: 'v2' }))

    // Legacy registry ownership can remain after a name has migrated to V2.
    mocks.getV1Owner.mockResolvedValue({
      owner: '0x0000000000000000000000000000000000000001',
      registrant: null,
      ownershipLevel: 'registrar',
    })

    const result = await getOwner({ name: 'gloomy.eth' })

    expect(result._unsafeUnwrap()).toEqual({
      owner: ownsName ? previousOwner : undefined,
      protocol: 'v2',
    })
    expect(mocks.getV1Owner).not.toHaveBeenCalled()
  })

  it('does not invent an owner when the registry has none', async () => {
    mocks.getNameDetail.mockReturnValue(okAsync({ protocol: 'v2' }))
    mocks.readContract.mockResolvedValue({ expiry, latestOwner: zeroAddress })

    const result = await getOwner({ name: 'gloomy.eth' })

    expect(result._unsafeUnwrap()).toEqual({
      owner: undefined,
      protocol: 'v2',
    })
  })

  it('returns an error when the previous owner cannot be verified on-chain', async () => {
    mocks.getNameDetail.mockReturnValue(okAsync({ protocol: 'v2' }))
    mocks.readContract.mockRejectedValue(new Error('RPC unavailable'))

    const result = await getOwner({ name: 'gloomy.eth' })

    expect(result.isErr()).toBe(true)
    expect(mocks.getV1Owner).not.toHaveBeenCalled()
  })

  it.each([
    {
      name: 'dappwright-test-1758107190099.eth',
      status: 'active',
      registrant: '0x0000000000000000000000000000000000000001',
    },
    {
      name: 'phantombug01.eth',
      status: 'in grace period',
      registrant: null,
    },
  ])('keeps an indexed V1 name $status on V1', async ({ name, registrant }) => {
    const owner = '0x0000000000000000000000000000000000000001'
    mocks.getV2Owner.mockResolvedValue(zeroAddress)
    mocks.getNameDetail.mockReturnValue(okAsync({ protocol: 'v1' }))
    mocks.getV1Owner.mockResolvedValue({
      owner,
      registrant,
      ownershipLevel: 'registrar',
    })

    const result = await getOwner({ name })

    expect(result._unsafeUnwrap()).toEqual({ owner, protocol: 'v1' })
    expect(mocks.getV1Owner).toHaveBeenCalledWith(mocks.client, { name })
    expect(mocks.readContract).not.toHaveBeenCalled()
  })

  it('returns an error when the index cannot be read', async () => {
    mocks.getNameDetail.mockReturnValue(errAsync(new Error('bigname down')))

    const result = await getOwner({ name: 'gloomy.eth' })

    expect(result.isErr()).toBe(true)
    expect(mocks.getV1Owner).not.toHaveBeenCalled()
  })

  it('falls back to V1 ownership when V2 has no owner', async () => {
    mocks.getV1Owner.mockResolvedValue({
      owner: '0x0000000000000000000000000000000000000001',
      registrant: '0x0000000000000000000000000000000000000001',
      ownershipLevel: 'registrar',
    })

    const result = await getOwner({ name: 'fgeorgescu.eth' })

    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap()).toEqual({
      owner: '0x0000000000000000000000000000000000000001',
      protocol: 'v1',
    })
    expect(mocks.getNameDetail).toHaveBeenCalled()
    expect(mocks.readContract).not.toHaveBeenCalled()
  })

  it('skips the V2 2LD registration check for subnames', async () => {
    mocks.getV1Owner.mockResolvedValue({
      owner: '0x0000000000000000000000000000000000000001',
      ownershipLevel: 'registry',
    })

    const result = await getOwner({ name: 'sub.fgeorgescu.eth' })

    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap()).toEqual({
      owner: '0x0000000000000000000000000000000000000001',
      protocol: 'v1',
    })
    expect(mocks.getNameDetail).not.toHaveBeenCalled()
    expect(mocks.readContract).not.toHaveBeenCalled()
  })

  it('returns null when neither protocol has an owner or registration', async () => {
    const result = await getOwner({ name: 'unregistered.eth' })

    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap()).toBeNull()
    expect(mocks.getNameDetail).toHaveBeenCalled()
    expect(mocks.getV1Owner).toHaveBeenCalled()
  })
})
