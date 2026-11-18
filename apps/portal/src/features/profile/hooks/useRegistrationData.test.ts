import { QueryClient } from '@tanstack/react-query'
import { okAsync } from 'neverthrow'
import { describe, expect, it, vi } from 'vitest'
import { indexer } from '@/lib/indexer'
import { getRegistrationTxQueryOptions } from './useRegistrationData'

vi.mock('@/lib/indexer', () => ({ indexer: { getNameHistory: vi.fn() } }))

const TX = '0x94139e4aecf39b7b78dd14b45df241b83f911ea2029ec92646a6881060fcfba4'

describe('getRegistrationTxQueryOptions', () => {
  it('reads the first registration row from registered_at, so a migrated name links its ENSv1 registration', async () => {
    vi.mocked(indexer.getNameHistory).mockReturnValue(
      okAsync({
        items: [
          {
            id: 'a'.repeat(64),
            type: 'registration',
            name: 'goatagent.eth',
            registrationId: null,
            blockNumber: 1,
            timestamp: new Date(1_791_041_136_000),
            transactionHash: TX,
            logIndex: 0,
            contractAddress: null,
            kind: null,
            data: {},
          },
        ],
        nextCursor: null,
        totalCount: null,
      }),
    )

    const hash = await new QueryClient().fetchQuery(
      getRegistrationTxQueryOptions({
        name: 'GoatAgent.eth',
        registeredAt: 1768579704,
      }),
    )

    expect(hash).toBe(TX)
    expect(indexer.getNameHistory).toHaveBeenCalledWith(
      {
        name: 'goatagent.eth',
        types: ['registration'],
        order: 'asc',
        from: new Date(1_768_579_704_000),
        pageSize: 1,
      },
      { signal: expect.any(AbortSignal) },
    )
  })
})
