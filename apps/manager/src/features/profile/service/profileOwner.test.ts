import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { labelhash, namehash, zeroAddress } from 'viem'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  GRACE_PERIOD_DAYS,
  MS_PER_DAY,
  V2_GRACE_PERIOD_DAYS,
} from '@/features/grace/utils/gracePeriod'
import { isConnectedProfileOwner } from '@/features/profile/components/view/connectedAccounts.helpers'
import { shouldShowThirdPartyRenewalWarning } from '@/features/renew/utils/thirdPartyRenewalWarning'
import { sepoliaWithEns } from '@/lib/wagmi'

const mocks = vi.hoisted(() => ({
  client: {},
  getV1Expiry: vi.fn(),
  getNameDetail: vi.fn(),
  getV1Owner: vi.fn(),
  getV2Owner: vi.fn(),
  readContract: vi.fn(),
}))

vi.mock('@ensdomains/ensjs/public/v1', () => ({
  getExpiry: mocks.getV1Expiry,
  getOwner: mocks.getV1Owner,
}))

vi.mock('@ensdomains/ensjs/public/v2', () => ({
  getOwner: mocks.getV2Owner,
}))

vi.mock('viem/actions', () => ({
  readContract: mocks.readContract,
}))

vi.mock('@/features/shared/service/nameDetail', () => ({
  getNameDetail: mocks.getNameDetail,
}))

vi.mock('@/lib/wagmi/helpers', async () => {
  const { ok } = await import('neverthrow')
  return {
    safeGetClient: () => ok(mocks.client),
  }
})

import { errAsync, okAsync } from 'neverthrow'
import { getOwner } from './profileOwner'

const previousOwner = '0x0000000000000000000000000000000000000002'
const expiryDate = new Date('2026-07-01T00:00:00Z')
const expiry = BigInt(expiryDate.getTime() / 1000)
const graceState = {
  expiry,
  latestOwner: previousOwner,
  resource: 0n,
  status: 0,
  tokenId: 0n,
}

describe('getOwner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(expiryDate.getTime() + MS_PER_DAY)
    mocks.getV2Owner.mockResolvedValue(null)
    mocks.getV1Expiry.mockResolvedValue(null)
    mocks.getV1Owner.mockResolvedValue(null)
    mocks.readContract.mockResolvedValue({
      expiry: 0n,
      latestOwner: zeroAddress,
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
    expect(mocks.getV1Owner).not.toHaveBeenCalled()
    expect(mocks.readContract).not.toHaveBeenCalled()
  })

  it('recovers the on-chain owner of a V2 registration during grace', async () => {
    mocks.getV2Owner.mockResolvedValue(zeroAddress)
    mocks.readContract.mockResolvedValue(graceState)

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
    expect(mocks.getV1Owner).not.toHaveBeenCalled()
    expect(mocks.readContract).toHaveBeenCalledWith(
      mocks.client,
      expect.objectContaining({
        functionName: 'getState',
        args: [BigInt(labelhash('gloomy'))],
      }),
    )
  })

  it.each(['walletAddress', 'accountAddress', 'ownerAddress'] as const)(
    'recognises the previous owner through %s without a third-party warning',
    async (addressKey) => {
      mocks.readContract.mockResolvedValue(graceState)

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
    },
  )

  it.each([
    { elapsed: 1, ownsName: true },
    { elapsed: V2_GRACE_PERIOD_DAYS * MS_PER_DAY - 1, ownsName: true },
    { elapsed: V2_GRACE_PERIOD_DAYS * MS_PER_DAY, ownsName: false },
    { elapsed: (V2_GRACE_PERIOD_DAYS + 1) * MS_PER_DAY, ownsName: false },
  ])(
    'limits previous ownership at expiry + $elapsed ms',
    async ({ elapsed, ownsName }) => {
      vi.setSystemTime(expiryDate.getTime() + elapsed)
      mocks.readContract.mockResolvedValue(graceState)

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
    },
  )

  it('does not invent an owner when the registry has none', async () => {
    mocks.readContract.mockResolvedValue({ expiry, latestOwner: zeroAddress })

    const result = await getOwner({ name: 'gloomy.eth' })

    expect(result._unsafeUnwrap()).toBeNull()
  })

  it('returns an error when the previous owner cannot be verified on-chain', async () => {
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
    mocks.getV1Owner.mockResolvedValue({
      owner,
      registrant,
      ownershipLevel: 'registrar',
    })

    const result = await getOwner({ name })

    expect(result._unsafeUnwrap()).toEqual({ owner, protocol: 'v1' })
    expect(mocks.getV1Owner).toHaveBeenCalledWith(mocks.client, { name })
    expect(mocks.readContract).toHaveBeenCalledWith(
      mocks.client,
      expect.objectContaining({ functionName: 'getState' }),
    )
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
    expect(mocks.readContract).toHaveBeenCalledWith(
      mocks.client,
      expect.objectContaining({ functionName: 'getState' }),
    )
  })

  it('reports the registrar holder rather than a different registry controller', async () => {
    mocks.getV1Owner.mockResolvedValue({
      owner: '0x0000000000000000000000000000000000000001',
      registrant: '0x0000000000000000000000000000000000000003',
      ownershipLevel: 'registrar',
    })

    const result = await getOwner({ name: 'yield.eth' })

    expect(result._unsafeUnwrap()).toEqual({
      owner: '0x0000000000000000000000000000000000000003',
      protocol: 'v1',
    })
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
    expect(mocks.readContract).not.toHaveBeenCalled()
  })

  describe('wrapped V1 name in its grace period', () => {
    const wrappedOwner = '0x0000000000000000000000000000000000000004'
    const NAME_WRAPPER = getChainContractAddress({
      chain: sepoliaWithEns,
      contract: 'ensNameWrapper',
    })

    const mockReads = (getData: () => Promise<unknown>) =>
      mocks.readContract.mockImplementation(
        (_client: unknown, { functionName }: { functionName: string }) =>
          functionName === 'getData'
            ? getData()
            : Promise.resolve({ ...graceState, latestOwner: zeroAddress }),
      )

    beforeEach(() => {
      mocks.getV1Owner.mockResolvedValue({
        owner: NAME_WRAPPER,
        registrant: null,
        ownershipLevel: 'registrar',
      })
      mocks.getV1Expiry.mockResolvedValue({
        expiry,
        gracePeriod: GRACE_PERIOD_DAYS * 24 * 60 * 60,
        status: 'gracePeriod',
      })
    })

    it('reads the owner the NameWrapper retains', async () => {
      mockReads(() => Promise.resolve([wrappedOwner, 196608, 0n]))

      const result = await getOwner({ name: 'wrapped.eth' })

      expect(result._unsafeUnwrap()).toEqual({
        owner: wrappedOwner,
        protocol: 'v1',
      })
      expect(mocks.readContract).toHaveBeenCalledWith(
        mocks.client,
        expect.objectContaining({
          address: NAME_WRAPPER,
          functionName: 'getData',
          args: [BigInt(namehash('wrapped.eth'))],
        }),
      )
    })

    it('does not read the NameWrapper outside grace', async () => {
      vi.setSystemTime(expiryDate.getTime() - MS_PER_DAY)
      mockReads(() => Promise.resolve([wrappedOwner, 196608, 0n]))

      const result = await getOwner({ name: 'wrapped.eth' })

      expect(result._unsafeUnwrap()).toEqual({
        owner: NAME_WRAPPER,
        protocol: 'v1',
      })
      expect(mocks.readContract).not.toHaveBeenCalledWith(
        mocks.client,
        expect.objectContaining({ functionName: 'getData' }),
      )
    })

    it('reports no owner when the NameWrapper holds none', async () => {
      mockReads(() => Promise.resolve([zeroAddress, 0, 0n]))

      const result = await getOwner({ name: 'wrapped.eth' })

      expect(result._unsafeUnwrap()).toEqual({
        owner: undefined,
        protocol: 'v1',
      })
    })

    it('returns an error when the expiry cannot be read', async () => {
      mockReads(() => Promise.resolve([wrappedOwner, 196608, 0n]))
      mocks.getV1Expiry.mockRejectedValue(new Error('RPC unavailable'))

      const result = await getOwner({ name: 'wrapped.eth' })

      expect(result.isErr()).toBe(true)
    })

    it('returns an error when the NameWrapper cannot be read', async () => {
      mockReads(() => Promise.reject(new Error('RPC unavailable')))

      const result = await getOwner({ name: 'wrapped.eth' })

      expect(result.isErr()).toBe(true)
    })
  })

  it('returns null when neither protocol has an owner or registration', async () => {
    const result = await getOwner({ name: 'unregistered.eth' })

    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap()).toBeNull()
    expect(mocks.readContract).toHaveBeenCalledWith(
      mocks.client,
      expect.objectContaining({ functionName: 'getState' }),
    )
    expect(mocks.getV1Owner).toHaveBeenCalled()
  })

  describe('unwrapped V1 name in its grace period', () => {
    const manager = '0x0000000000000000000000000000000000000005'
    const holder = '0x0000000000000000000000000000000000000006'
    const detail = {
      protocol: 'v1',
      isSupported: true,
      owner: holder,
    }

    beforeEach(() => {
      mocks.getV1Owner.mockResolvedValue({
        owner: manager,
        registrant: null,
        ownershipLevel: 'registrar',
      })
      mocks.getV1Expiry.mockResolvedValue({
        expiry,
        gracePeriod: GRACE_PERIOD_DAYS * 24 * 60 * 60,
        status: 'gracePeriod',
      })
      mocks.getNameDetail.mockReturnValue(okAsync(detail))
    })

    it('recovers the indexed holder instead of the records manager', async () => {
      const result = await getOwner({ name: 'unwrapped.eth' })

      expect(result._unsafeUnwrap()).toEqual({ owner: holder, protocol: 'v1' })
      expect(mocks.getNameDetail).toHaveBeenCalledWith('unwrapped.eth')
      expect(mocks.readContract).not.toHaveBeenCalledWith(
        mocks.client,
        expect.objectContaining({ functionName: 'getData' }),
      )
    })

    it.each([
      ['is not indexed', null],
      ['is unsupported', { ...detail, isSupported: false }],
      ['has no owner', { ...detail, owner: zeroAddress }],
      ['is served by another protocol', { ...detail, protocol: 'v2' }],
    ])('reports no owner when the detail %s', async (_case, value) => {
      mocks.getNameDetail.mockReturnValue(okAsync(value))

      const result = await getOwner({ name: 'unwrapped.eth' })

      expect(result._unsafeUnwrap()).toEqual({
        owner: undefined,
        protocol: 'v1',
      })
    })

    it('returns an error when the detail read fails', async () => {
      mocks.getNameDetail.mockReturnValue(errAsync(new Error('bigname down')))

      const result = await getOwner({ name: 'unwrapped.eth' })

      expect(result._unsafeUnwrapErr()).toMatchObject({ _tag: 'GetOwnerError' })
    })

    it('keeps the registry owner outside grace without reading the detail', async () => {
      vi.setSystemTime(expiryDate.getTime() - MS_PER_DAY)

      const result = await getOwner({ name: 'unwrapped.eth' })

      expect(result._unsafeUnwrap()).toEqual({ owner: manager, protocol: 'v1' })
      expect(mocks.getNameDetail).not.toHaveBeenCalled()
    })

    it('does not read the expiry of an unregistered name', async () => {
      mocks.getV1Owner.mockResolvedValue(null)

      const result = await getOwner({ name: 'unregistered.eth' })

      expect(result._unsafeUnwrap()).toBeNull()
      expect(mocks.getV1Expiry).not.toHaveBeenCalled()
    })
  })
})
