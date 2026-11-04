import type { NameHistoryRow } from '@ens-apps/indexer/bigname'
import { QueryClient } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getProfileCreationEvent,
  getProfileCreationQueryOptions,
} from './profileCreation'

const REGISTRATION: NameHistoryRow = {
  id: 'registration',
  name: 'alice.eth',
  namespace: 'ens',
  registration_id: 'first-registration',
  type: 'registration',
  block_number: 1,
  timestamp: '1761350400',
  transaction_hash: `0x${'12'.repeat(32)}`,
  log_index: 0,
}

afterEach(() => vi.restoreAllMocks())

describe('getProfileCreationEvent', () => {
  it('keeps the creation date paired with its registration transaction', () => {
    expect(getProfileCreationEvent(REGISTRATION)).toEqual({
      createdAt: new Date('2025-10-25T00:00:00.000Z'),
      transactionHash: REGISTRATION.transaction_hash,
    })
  })

  it.each([
    undefined,
    { ...REGISTRATION, type: 'renewal' as const },
    { ...REGISTRATION, timestamp: null },
    { ...REGISTRATION, transaction_hash: null },
  ])('does not present an unproven creation event: %j', (row) => {
    expect(getProfileCreationEvent(row)).toBeNull()
  })

  it('requests the oldest registration rather than a recent renewal or re-registration', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ data: [REGISTRATION], meta: {} }))
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    const creation = await client.fetchQuery(
      getProfileCreationQueryOptions({ name: 'alice.eth' }),
    )
    const [input] = fetch.mock.calls[0] ?? []
    const url = new URL(String(input))

    expect(url.pathname).toBe('/v1/names/alice.eth/history')
    expect(url.searchParams.get('type')).toBe('registration')
    expect(url.searchParams.get('order')).toBe('asc')
    expect(url.searchParams.get('page_size')).toBe('1')
    expect(creation?.transactionHash).toBe(REGISTRATION.transaction_hash)
  })
})
