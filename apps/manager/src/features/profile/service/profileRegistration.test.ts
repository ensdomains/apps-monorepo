import { namehash } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  client: {},
  getBlock: vi.fn(),
  getNameHistory: vi.fn(),
  getRegistrationDate: vi.fn(),
  indexerQuery: vi.fn(),
}))

vi.mock('@ensdomains/ensjs/public/v2', () => ({
  getRegistrationDate: mocks.getRegistrationDate,
}))

vi.mock('@ensdomains/ensjs/subgraph', () => ({
  getNameHistory: mocks.getNameHistory,
}))

vi.mock('viem/actions', () => ({
  getBlock: mocks.getBlock,
}))

vi.mock('@/lib/indexer-client', () => ({
  indexerClient: {
    query: (...args: unknown[]) => ({
      toPromise: () => Promise.resolve(mocks.indexerQuery(...args)),
    }),
  },
}))

vi.mock('@/lib/wagmi/helpers', async () => {
  const { ok } = await import('neverthrow')
  return {
    safeGetClient: () => ok(mocks.client),
  }
})

import {
  getRegistration,
  profileRegistrationQuery,
} from './profileRegistration'

describe('profileRegistrationQuery', () => {
  it('includes protocol in the query key', () => {
    expect(profileRegistrationQuery('foo.eth', 'v1').queryKey).toEqual([
      {
        $scope: 'profile',
        $action: 'registration',
        name: 'foo.eth',
        protocol: 'v1',
      },
    ])
  })
})

describe('getRegistration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.indexerQuery.mockResolvedValue({ data: { domain: null } })
  })

  it('reads a V2 registration date from the indexer', async () => {
    mocks.indexerQuery.mockResolvedValue({
      data: { domain: { registrationDate: 1_789_640_616 } },
    })

    const result = await getRegistration('rabbit.eth', 'v2')

    expect(result._unsafeUnwrap()).toEqual({ registrationDate: 1_789_640_616 })
    expect(mocks.indexerQuery).toHaveBeenCalledWith(expect.anything(), {
      id: namehash('rabbit.eth'),
    })
    expect(mocks.getRegistrationDate).not.toHaveBeenCalled()
  })

  it('falls back on chain for a V2 name the indexer has not seen yet', async () => {
    mocks.getRegistrationDate.mockResolvedValue(1_800_000_000n)

    const result = await getRegistration('figma.eth', 'v2')

    expect(result._unsafeUnwrap()).toEqual({ registrationDate: 1_800_000_000 })
  })

  it('falls back on chain when the indexer request fails', async () => {
    mocks.indexerQuery.mockRejectedValue(new Error('indexer down'))
    mocks.getRegistrationDate.mockResolvedValue(1_800_000_000n)

    const result = await getRegistration('figma.eth', 'v2')

    expect(result._unsafeUnwrap()).toEqual({ registrationDate: 1_800_000_000 })
  })

  it('reads a subname registration date from the indexer', async () => {
    mocks.indexerQuery.mockResolvedValue({
      data: { domain: { registrationDate: 1_790_000_000 } },
    })

    const result = await getRegistration('mini.shiba.eth')

    expect(result._unsafeUnwrap()).toEqual({ registrationDate: 1_790_000_000 })
    expect(mocks.indexerQuery).toHaveBeenCalledWith(expect.anything(), {
      id: namehash('mini.shiba.eth'),
    })
    expect(mocks.getRegistrationDate).not.toHaveBeenCalled()
  })

  it('reads a V1 registration date from the registration event block', async () => {
    mocks.getNameHistory.mockResolvedValue({
      registrationEvents: [
        { blockNumber: 20, type: 'NameRenewed' },
        { blockNumber: 15, type: 'NameRegistered' },
        { blockNumber: 5, type: 'NameRegistered' },
      ],
    })
    mocks.getBlock.mockResolvedValue({ timestamp: 1_800_000_000n })

    const result = await getRegistration('fgeorgescu.eth', 'v1')

    expect(result._unsafeUnwrap()).toEqual({ registrationDate: 1_800_000_000 })
    expect(mocks.getBlock).toHaveBeenCalledWith(mocks.client, {
      blockNumber: 15n,
    })
    expect(mocks.indexerQuery).not.toHaveBeenCalled()
  })
})
