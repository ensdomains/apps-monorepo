import { QueryClient } from '@tanstack/react-query'
import { okAsync } from 'neverthrow'
import { describe, expect, it, vi } from 'vitest'
import { bigname } from '@/lib/bigname'
import { getRegistrationTxQueryOptions } from './useRegistrationData'

vi.mock('@/lib/bigname', () => ({ bigname: { events: vi.fn() } }))

const TX = '0x94139e4aecf39b7b78dd14b45df241b83f911ea2029ec92646a6881060fcfba4'

describe('getRegistrationTxQueryOptions', () => {
  it('reads the oldest registration row of the current registration', async () => {
    vi.mocked(bigname.events).mockReturnValue(
      okAsync({
        data: [
          {
            id: 'a'.repeat(64),
            type: 'registration',
            namespace: 'ens',
            registration_id: 'reg-1',
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
      getRegistrationTxQueryOptions({ registrationId: 'reg-1' }),
    )

    expect(hash).toBe(TX)
    expect(bigname.events).toHaveBeenCalledWith(
      {
        registration_id: 'reg-1',
        type: ['registration'],
        order: 'asc',
        page_size: 1,
      },
      { signal: expect.any(AbortSignal) },
    )
  })
})
