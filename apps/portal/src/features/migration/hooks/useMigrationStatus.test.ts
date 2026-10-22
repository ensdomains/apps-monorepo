import { QueryClient } from '@tanstack/react-query'
import { ok } from 'neverthrow'
import type { Address } from 'viem'
import { namehash } from 'viem/ens'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ADDRESS: Address = '0x5b7d523f27c5b2232536fb900ebffb590d03ff5d'
const mockClient = { chain: { id: 11155111 } }
const classifiedName = {
  name: 'test.eth',
  tokenHolder: ADDRESS,
  tokenType: 'unlocked',
}
const mockClassifyName = vi.fn(() => ({
  type: 'classified',
  name: classifiedName,
}))
const mockRunEligibilityChecks = vi.fn(async () => ({
  eligible: [classifiedName],
  failed: [],
}))

vi.mock('@ens-apps/migration', () => ({
  classifyName: mockClassifyName,
  runEligibilityChecks: mockRunEligibilityChecks,
}))
vi.mock('@/lib/wagmi/helpers', () => ({
  safeGetClient: () => ok(mockClient),
}))

const mockGraphqlRequest = vi.fn()
vi.mock('@/lib/indexer', () => ({
  graphqlIndexerClient: { request: mockGraphqlRequest },
}))

const { getMigrationStatusQueryOptions } = await import('./useMigrationStatus')

describe('getMigrationStatusQueryOptions', () => {
  beforeEach(() => {
    mockClassifyName.mockClear()
    mockRunEligibilityChecks.mockClear()
    mockGraphqlRequest.mockReset()
  })

  it('reads the V1 domain through the indexer before checking eligibility', async () => {
    mockGraphqlRequest.mockResolvedValue({
      domains: [
        {
          id: namehash('test.eth'),
          labelName: 'test',
          labelhash:
            '0x9c22ff5f21f0b81b33ab9d58851f697f70db1c4d8b6f7d07db6c3f2b9f2b4d8a',
          name: 'test.eth',
          resolver: null,
          owner: { id: ADDRESS },
          registrant: { id: ADDRESS },
          wrappedOwner: { id: ADDRESS },
          parent: {
            id: namehash('eth'),
            name: 'eth',
            wrappedDomain: null,
          },
          registration: { expiryDate: '2000000000' },
          wrappedDomain: { expiryDate: '2000000000', fuses: 0 },
        },
      ],
    })

    const data = await new QueryClient().fetchQuery(
      getMigrationStatusQueryOptions({ name: 'test.eth', address: ADDRESS }),
    )

    expect(data).toEqual({
      migratable: true,
      tokenHolder: ADDRESS,
      tokenType: 'unlocked',
    })
    expect(mockGraphqlRequest.mock.calls[0]?.[1]).toEqual({ name: 'test.eth' })
    expect(mockClassifyName).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'test.eth' }),
      ADDRESS,
      expect.any(Number),
    )
    expect(mockRunEligibilityChecks).toHaveBeenCalledWith(
      mockClient,
      [classifiedName],
      ADDRESS,
    )
  })
})
