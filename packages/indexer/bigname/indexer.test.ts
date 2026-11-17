import type { ResultAsync } from 'neverthrow'
import { describe, expect, it, vi } from 'vitest'
import type { IndexerClient } from '../reads/client.types'
import type { IndexerReadError } from '../reads/errors'
import { apiError, envelope, json } from './fetch.mock'
import { createBignameIndexer, createGoldskyIndexer } from './indexer'

const RESOLVER = '0x5FEA82d96b8dd71e33138c6cba615f8bcf088d3a'
const REGISTRY = '0xd4ebcbbdf463c9c45784603db0ddd499bc44a8b4'

const indexerWith = (
  create: typeof createBignameIndexer,
  ...responses: Response[]
) => {
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () => responses.shift() ?? json({}, 500),
  )
  const indexer = create({
    baseUrl: 'https://bigname.example/',
    chainId: 11155111,
    fetch,
  })
  const urlOf = (call = 0) => String(fetch.mock.calls[call]?.[0])
  return { indexer, urlOf }
}

describe('createBignameIndexer', () => {
  it.each<{
    read: string
    call: (indexer: IndexerClient) => ResultAsync<unknown, IndexerReadError>
    url: string
  }>([
    {
      read: 'record keys at a given resolver',
      call: (indexer) =>
        indexer.getRecordKeys({ name: 'alice.eth', resolver: RESOLVER }),
      url: `https://bigname.example/v1/resolvers/11155111/${RESOLVER.toLowerCase()}/records?name=alice.eth&values=false&include=inventory`,
    },
    {
      read: 'events for a resolver',
      call: (indexer) =>
        indexer.getEvents({
          resolver: RESOLVER,
          types: ['record'],
          pageSize: 5,
        }),
      url: `https://bigname.example/v1/events?type=record&page_size=5&resolver=11155111%3A${RESOLVER.toLowerCase()}&include=data%2Craw`,
    },
    {
      read: 'name history with child registrations',
      call: (indexer) =>
        indexer.getNameHistory({
          name: 'alice.eth',
          from: new Date('2026-01-01T00:00:00Z'),
          includeChildRegistrations: true,
          includeTotal: true,
        }),
      url: 'https://bigname.example/v1/names/alice.eth/history?from_timestamp=1767225600&namespace=ens&include=data%2Craw%2Ctotal_count%2Cchild_registrations',
    },
    {
      read: 'root permissions of a registry',
      call: (indexer) => indexer.getPermissions({ registry: REGISTRY }),
      url: `https://bigname.example/v1/permissions?registry=11155111%3A${REGISTRY}`,
    },
  ])('reads $read from its route', async ({ call, url }) => {
    const { indexer, urlOf } = indexerWith(createBignameIndexer, envelope([]))

    await call(indexer)

    expect(urlOf()).toBe(url)
  })

  it.each<{
    read: string
    call: (indexer: IndexerClient) => ResultAsync<unknown, IndexerReadError>
    empty: unknown
  }>([
    {
      read: 'a registry',
      call: (indexer) => indexer.getRegistry({ address: REGISTRY }),
      empty: null,
    },
    {
      read: 'subnames',
      call: (indexer) => indexer.getSubnames({ name: 'nobody.eth' }),
      empty: { items: [], nextCursor: null, totalCount: 0 },
    },
  ])(
    'reads $read bigname has never indexed as empty',
    async ({ call, empty }) => {
      const { indexer } = indexerWith(
        createBignameIndexer,
        apiError('not_found', 404),
      )

      expect((await call(indexer))._unsafeUnwrap()).toEqual(empty)
    },
  )

  it('answers a batch in input order, with null for a name bigname does not know', async () => {
    const record = {
      name: 'alice.eth',
      display_name: 'alice.eth',
      namespace: 'ens',
      namehash: '0xabc',
      read_status: 'ok',
      authority: 'ens_v2',
    }
    const { indexer } = indexerWith(
      createBignameIndexer,
      envelope([
        { input: { name: 'alice.eth' }, kind: 'name', status: 'ok', record },
        { input: { name: 'nobody.eth' }, kind: 'name', status: 'not_found' },
      ]),
    )

    const result = await indexer.getNames({
      names: ['alice.eth', 'nobody.eth'],
    })

    expect(
      result._unsafeUnwrap().map((detail) => detail?.name ?? null),
    ).toEqual(['alice.eth', null])
  })

  it('reports the indexed block of its own chain', async () => {
    const { indexer } = indexerWith(
      createBignameIndexer,
      envelope({
        chains: {
          '1': { indexed_block: 1 },
          '11155111': { indexed_block: 42 },
        },
      }),
    )

    expect((await indexer.getSyncStatus())._unsafeUnwrap()).toEqual({
      indexedBlock: 42,
    })
  })
})

describe('createGoldskyIndexer', () => {
  it('reads bigname routes under /v2', async () => {
    const { indexer, urlOf } = indexerWith(
      createGoldskyIndexer,
      envelope({ chains: {} }),
    )

    await indexer.getSyncStatus()

    expect(urlOf()).toBe('https://bigname.example/v2/status')
  })
})
