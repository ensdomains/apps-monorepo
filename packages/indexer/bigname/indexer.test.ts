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
    {
      read: 'name history',
      call: (indexer) => indexer.getNameHistory({ name: 'nobody.eth' }),
      empty: null,
    },
    {
      read: 'registry labels',
      call: (indexer) => indexer.getRegistryLabels({ address: REGISTRY }),
      empty: null,
    },
    {
      read: 'record keys',
      call: (indexer) => indexer.getRecordKeys({ name: 'nobody.eth' }),
      empty: null,
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

  it('answers null for a name bigname could not fully read', async () => {
    const { indexer } = indexerWith(
      createBignameIndexer,
      envelope([
        {
          input: { name: 'alice.eth' },
          kind: 'name',
          status: 'ok',
          record: {
            name: 'alice.eth',
            display_name: 'alice.eth',
            namespace: 'ens',
            namehash: '0xabc',
            read_status: 'stale',
            authority: 'ens_v2',
          },
        },
      ]),
    )

    const result = await indexer.getNames({ names: ['alice.eth'] })

    expect(result._unsafeUnwrap()).toEqual([null])
  })

  it('keeps the resolver of a name indexed without a record inventory', async () => {
    const { indexer } = indexerWith(
      createBignameIndexer,
      envelope({ resolver: { address: RESOLVER.toLowerCase() } }),
    )

    const keys = await indexer.getRecordKeys({ name: 'alice.eth' })

    expect(keys._unsafeUnwrap()).toEqual({
      resolver: RESOLVER.toLowerCase(),
      inventory: null,
    })
  })

  it('keeps a grant scoped to a setter argument under the argument’s own hash', async () => {
    const { indexer } = indexerWith(
      createBignameIndexer,
      json({
        data: [
          {
            address: '0x0000000000000000000000000000000000000001',
            registration_id: null,
            powers: ['set_text'],
            record_resource: {
              kind: 'argument',
              hash: '0x02',
              selectors: [{ kind: 'text', hash: '0x03', key_bytes: '0x6869' }],
            },
          },
        ],
        meta: { as_of: {}, completeness: 'partial' },
      }),
    )

    const page = (
      await indexer.getResolverRoles({ address: RESOLVER })
    )._unsafeUnwrap()

    expect(page.completeness).toBe('partial')
    expect(page.items[0]?.recordResource).toEqual({
      kind: 'text',
      hash: '0x02',
      key: '0x6869',
    })
  })

  it('reports a wrapper state bigname cannot tell as unknown', async () => {
    const { indexer } = indexerWith(
      createBignameIndexer,
      envelope([
        {
          name: 'sub.alice.eth',
          display_name: 'sub.alice.eth',
          namehash: '0xabc',
          authority: 'ens_v1',
          ens_v1: { wrapper_state: 'lapsed' },
        },
      ]),
    )

    const page = (
      await indexer.getSubnames({ name: 'alice.eth' })
    )._unsafeUnwrap()

    expect(page.items[0]?.wrapper?.state).toBe('unknown')
  })

  it('tells a request bigname cannot answer from one it refuses', async () => {
    const { indexer } = indexerWith(
      createBignameIndexer,
      apiError('unsupported', 422),
      apiError('invalid_input', 400),
    )
    const read = () =>
      indexer.getNamesForAddress({
        address: RESOLVER,
        resolvesTo: true,
        coinType: 'evm',
      })

    expect((await read())._unsafeUnwrapErr().kind).toBe('unsupported')
    expect((await read())._unsafeUnwrapErr().kind).toBe('rejected')
  })

  it('dates a lapsed reserved ENSv1 name by its lease and serves its reservation', async () => {
    const owner = '0x1111111111111111111111111111111111111111'
    const { indexer, urlOf } = indexerWith(
      createBignameIndexer,
      envelope([
        {
          name: 'old.eth',
          display_name: 'old.eth',
          namespace: 'ens',
          namehash: '0x01',
          status: 'expired',
          authority: 'ens_v1',
          expires_at: '1799006556',
          ens_v1: { expires_at: '1793649756' },
          relations: ['former_owner'],
          is_primary: false,
          lapsed_registration: { owner, release_kind: 'expired' },
        },
      ]),
    )

    const names = await indexer.getLapsedNames({
      address: owner,
      now: new Date('2026-11-17T00:00:00Z'),
      since: new Date('2026-10-18T00:00:00Z'),
    })

    expect(names._unsafeUnwrap()).toMatchObject([
      {
        name: 'old.eth',
        expiresAt: new Date(1793649756 * 1000),
        servedExpiry: 1799006556n,
      },
    ])
    expect(urlOf()).toContain('relation=former_owner')
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
