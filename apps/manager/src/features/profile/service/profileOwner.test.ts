import { namehash } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  client: {},
  getV1Owner: vi.fn(),
  getV2Owner: vi.fn(),
  getV2Domain: vi.fn(),
  queryV2Domain: vi.fn(),
  readContract: vi.fn(),
}))

vi.mock('@ens-apps/indexer/urql', () => ({
  default: {
    query: mocks.queryV2Domain,
  },
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

describe('getOwner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getV2Owner.mockResolvedValue(null)
    mocks.getV2Domain.mockResolvedValue({ data: { domain: null } })
    mocks.queryV2Domain.mockReturnValue({ toPromise: mocks.getV2Domain })
    mocks.getV1Owner.mockResolvedValue(null)
    mocks.readContract.mockResolvedValue(2)
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
    expect(mocks.queryV2Domain).not.toHaveBeenCalled()
    expect(mocks.getV1Owner).not.toHaveBeenCalled()
  })

  it('treats a V2-reserved 2LD as V1 even when universal resolution finds its owner', async () => {
    const owner = '0x0000000000000000000000000000000000000001'
    mocks.readContract.mockResolvedValue(1)
    mocks.getV2Owner.mockResolvedValue(owner)
    mocks.getV1Owner.mockResolvedValue({
      owner,
      registrant: owner,
      ownershipLevel: 'registrar',
    })

    const result = await getOwner({ name: 'frozen.eth' })

    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap()).toEqual({
      owner,
      protocol: 'v1',
    })
    expect(mocks.getV2Owner).not.toHaveBeenCalled()
    expect(mocks.queryV2Domain).not.toHaveBeenCalled()
  })

  it('returns V2 protocol without an owner for an expired V2 registration', async () => {
    const domainId = namehash('gloomy.eth')

    mocks.readContract.mockResolvedValue(0)
    mocks.getV2Domain.mockResolvedValue({
      data: { domain: { id: domainId } },
    })

    const result = await getOwner({ name: 'gloomy.eth' })

    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap()).toEqual({
      owner: undefined,
      protocol: 'v2',
    })
    expect(mocks.queryV2Domain).toHaveBeenCalledWith(expect.anything(), {
      id: domainId,
    })
    expect(mocks.getV1Owner).toHaveBeenCalled()
  })

  it('returns V1 ownership when the V2 name is not registered', async () => {
    mocks.readContract.mockResolvedValue(0)
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
    expect(mocks.queryV2Domain).not.toHaveBeenCalled()
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
    expect(mocks.queryV2Domain).not.toHaveBeenCalled()
    expect(mocks.readContract).not.toHaveBeenCalled()
  })

  it('returns null when neither protocol has an owner or registration', async () => {
    mocks.readContract.mockResolvedValue(0)

    const result = await getOwner({ name: 'unregistered.eth' })

    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap()).toBeNull()
    expect(mocks.queryV2Domain).toHaveBeenCalled()
    expect(mocks.getV1Owner).toHaveBeenCalled()
  })
})
