import { QueryClient } from '@tanstack/react-query'
import { okAsync } from 'neverthrow'
import { describe, expect, it, vi } from 'vitest'
import { bigname } from '@/lib/bigname'
import { getRegistrationTxQueryOptions } from './useRegistrationData'

vi.mock('@/lib/bigname', () => ({ bigname: { nameHistory: vi.fn() } }))

const TX = '0x94139e4aecf39b7b78dd14b45df241b83f911ea2029ec92646a6881060fcfba4'

describe('getRegistrationTxQueryOptions', () => {
  it('reads the first registration row from registered_at, so a migrated name links its ENSv1 registration', async () => {
    vi.mocked(bigname.nameHistory).mockReturnValue(
      okAsync({
        data: [
          {
            id: 'a'.repeat(64),
            type: 'registration',
            name: 'goatagent.eth',
            registration_id: null,
            namespace: 'ens',
            block_number: 1,
            timestamp: '1791041136',
            transaction_hash: TX,
            log_index: 0,
          },
        ],
        meta: { as_of: {} },
      }),
    )

    const hash = await new QueryClient().fetchQuery(
      getRegistrationTxQueryOptions({
        name: 'GoatAgent.eth',
        registeredAt: 1768579704,
      }),
    )

    expect(hash).toBe(TX)
    expect(bigname.nameHistory).toHaveBeenCalledWith(
      'goatagent.eth',
      {
        namespace: 'ens',
        type: ['registration'],
        order: 'asc',
        from_timestamp: '1768579704',
        page_size: 1,
      },
      { signal: expect.any(AbortSignal) },
    )
  })
})
