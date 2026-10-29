import type {
  LookupRecord,
  Meta,
  NameRecords,
  RecordInventory,
} from '@ens-apps/indexer/bigname'
import { BignameError } from '@ens-apps/indexer/bigname'
import { errAsync, okAsync, ResultAsync } from 'neverthrow'
import type { PublicClient } from 'viem'
import { namehash, zeroHash } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { resolverRecords, events, lookup, chain } = vi.hoisted(() => ({
  resolverRecords: vi.fn(),
  events: vi.fn(),
  lookup: vi.fn(),
  chain: { id: 11155111 },
}))
vi.mock('@/lib/bigname', () => ({
  bigname: { resolverRecords, events, lookup },
}))
vi.mock('@/config', () => ({ envConfig: { chain } }))

import { fetchV1Profiles, ProfileFetchError } from './fetchV1Profiles'
import { buildProfileMulticallPlan } from './fetchV1Profiles.helpers'
import { getV1ProfileKeys } from './v1ProfileKeys'

const RESOLVER = '0x8fade66b79cc9f707ab26799354482eb93a5b7dd'

const optimizedRead = (
  sources: Parameters<typeof getV1ProfileKeys>[0],
  options: Parameters<typeof getV1ProfileKeys>[1] = {},
) => getV1ProfileKeys(sources, { ...options, chainId: chain.id })

const source = (name: string) =>
  ({
    id: namehash(name),
    name,
    resolver: RESOLVER,
  }) as const

const bulkRecord = (name: string): LookupRecord => ({
  name,
  namehash: namehash(name),
  display_name: name,
  namespace: 'ens',
  read_status: 'ok',
  authority: 'ens_v1',
  resolver: { chain_id: 11155111, address: RESOLVER },
  records: {
    seen_addresses: ['60'],
    addresses: {},
    seen_texts: ['url'],
    texts: {},
    seen_abis: ['16'],
    abis: {},
    seen_singletons: ['contenthash', 'name'],
  },
})

const bulkAnswer = (
  names: readonly string[],
  recordOverrides: Partial<LookupRecord> = {},
) =>
  okAsync({
    data: names.map((name, index) => ({
      input: { id: String(index), name },
      kind: 'name',
      status: 'ok',
      record: { ...bulkRecord(name), ...recordOverrides },
    })),
    meta: {
      as_of: {
        '11155111': {
          block_number: 123,
          block_hash: zeroHash,
          timestamp: String(Math.floor(Date.now() / 1000)),
        },
      },
    } satisfies Meta,
  })

const inventory = (
  overrides: Partial<RecordInventory> = {},
): RecordInventory => ({
  known_keys: [],
  unset_keys: [],
  unsupported_keys: [],
  abi_content_types: [],
  ...overrides,
})

const answer = (data: Partial<NameRecords> = {}) =>
  okAsync({
    data: {
      namespace: 'ens',
      resolver: { chain_id: 11155111, address: RESOLVER },
      records: { contenthash: { status: 'not_found' } },
      inventory: inventory(),
      ...data,
    },
    meta: { as_of: {} },
  })

const recordEvents = (
  keys: readonly string[],
  nextCursor: string | null,
  meta: Record<string, unknown> = {},
) =>
  okAsync({
    data: keys.map((key) => ({ type: 'record', data: { key } })),
    page: { next_cursor: nextCursor },
    meta,
  })

const deferred = <T>() => {
  let resolve = (_value: T): void => {}
  const promise = new Promise<T>((onResolve) => {
    resolve = onResolve
  })
  return { promise, resolve }
}

describe('getV1ProfileKeys', () => {
  beforeEach(() => {
    chain.id = 11155111
    resolverRecords.mockReset()
    events.mockReset()
    lookup.mockReset()
    lookup.mockReturnValue(
      errAsync(
        new BignameError({
          code: 'unsupported',
          message: 'Bulk profile unavailable',
        }),
      ),
    )
    events.mockReturnValue(recordEvents([], null))
  })

  it('reads supplemental history while the independent bulk inventory is pending', async () => {
    const pending = deferred<Awaited<ReturnType<typeof bulkAnswer>>>()
    lookup.mockReturnValue(
      ResultAsync.fromSafePromise(pending.promise).andThen((result) => result),
    )
    events.mockReturnValue(recordEvents(['interface:0x12345678'], null))
    const read = optimizedRead([source('alice.eth')])
    try {
      await vi.waitFor(() => expect(events).toHaveBeenCalledTimes(1))
      expect(resolverRecords).not.toHaveBeenCalled()
    } finally {
      pending.resolve(await bulkAnswer(['alice.eth']))
      await read
    }
    expect((await read)._unsafeUnwrap()[0]?.interfaceIds).toEqual([
      '0x12345678',
    ])
  })

  it('refills a free history slot without waiting for a slow name, bounds concurrency, and preserves source order', async () => {
    const names = Array.from({ length: 10 }, (_, index) => `name${index}.eth`)
    const gates = names.map(() => deferred<void>())
    lookup.mockReturnValue(bulkAnswer(names))
    events.mockImplementation(({ name }: { name: string }) =>
      ResultAsync.fromSafePromise(
        (gates[names.indexOf(name)]?.promise ?? Promise.resolve()).then(() =>
          recordEvents([], null),
        ),
      ).andThen((result) => result),
    )
    const read = optimizedRead(names.map(source))
    try {
      await vi.waitFor(() => expect(events).toHaveBeenCalledTimes(8))
      gates[1]?.resolve()
      await vi.waitFor(() => expect(events).toHaveBeenCalledTimes(9))
      gates[8]?.resolve()
      await vi.waitFor(() => expect(events).toHaveBeenCalledTimes(10))
    } finally {
      for (const gate of [...gates].reverse()) gate.resolve()
      await read
    }
    expect((await read)._unsafeUnwrap().map(({ id }) => id)).toEqual(
      names.map(namehash),
    )
  })

  it.each(['abort', 'history failure'] as const)(
    'does not start queued names after an in-flight %s',
    async (failure) => {
      const names = Array.from({ length: 10 }, (_, index) => `name${index}.eth`)
      const pending = deferred<void>()
      const controller = new AbortController()
      lookup.mockReturnValue(bulkAnswer(names))
      events.mockImplementation(() =>
        ResultAsync.fromSafePromise(pending.promise).andThen(() =>
          recordEvents(
            failure === 'history failure' ? ['dns:zonehash'] : [],
            null,
          ),
        ),
      )
      const read = optimizedRead(names.map(source), {
        signal: controller.signal,
      })
      await vi.waitFor(() => expect(events).toHaveBeenCalledTimes(8))
      if (failure === 'abort') controller.abort()
      pending.resolve()

      const result = await read
      expect(result.isErr()).toBe(true)
      expect(events).toHaveBeenCalledTimes(8)
      if (failure === 'abort')
        expect(result._unsafeUnwrapErr().cause).toMatchObject({
          code: 'network',
        })
      else
        expect(result._unsafeUnwrapErr().cause).toMatchObject({
          recordType: 'dns',
          ensName: 'name0.eth',
        })
    },
  )

  it('stops queued names on a history failure even while that source inventory is still pending', async () => {
    const names = Array.from({ length: 20 }, (_, index) => `name${index}.eth`)
    const pending = deferred<void>()
    lookup.mockReturnValue(bulkAnswer(names))
    resolverRecords.mockReturnValue(
      ResultAsync.fromSafePromise(pending.promise).andThen(() => answer()),
    )
    events.mockImplementation(({ name }: { name: string }) =>
      recordEvents(name === 'name0.eth' ? ['dns:zonehash'] : [], null),
    )
    const sources = names.map(source)
    const read = optimizedRead([
      {
        ...source('name0.eth'),
        resolver: '0x0000000000000000000000000000000000001234',
      },
      ...sources.slice(1),
    ])
    try {
      await vi.waitFor(() => expect(resolverRecords).toHaveBeenCalledTimes(1))
      // Let successful siblings finish while the failed name's other read stays pending.
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(events).toHaveBeenCalledTimes(8)
    } finally {
      pending.resolve()
      await read
    }
    expect((await read)._unsafeUnwrapErr().cause).toMatchObject({
      recordType: 'dns',
      ensName: 'name0.eth',
    })
  })

  it('uses one fresh bulk read for several source inventories while preserving supplemental history', async () => {
    lookup.mockReturnValue(bulkAnswer(['alice.eth', 'bob.eth']))
    resolverRecords.mockReturnValue(answer())
    events.mockReturnValue(recordEvents(['interface:0x12345678'], null))

    const result = await optimizedRead([source('alice.eth'), source('bob.eth')])

    expect(result._unsafeUnwrap()).toEqual(
      ['alice.eth', 'bob.eth'].map((name) => ({
        id: namehash(name),
        texts: ['url'],
        coinTypes: [60],
        hasContentHash: true,
        abiContentTypes: [16n],
        interfaceIds: ['0x12345678'],
        hasName: true,
      })),
    )
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(resolverRecords).not.toHaveBeenCalled()
    expect(events).toHaveBeenCalledTimes(2)
    await optimizedRead([source('alice.eth'), source('bob.eth')])
    expect(lookup).toHaveBeenCalledTimes(2)
  })

  it.each([
    '0x0000000000000000000000000000000000001234',
    '0x5FfC014343cd971B7eb70732021E26C35B744cc4',
  ] as const)(
    'skips bulk lookup for resolver %s while preserving source inventory and supplemental history',
    async (resolver) => {
      chain.id = 1
      resolverRecords.mockReturnValue(
        answer({
          resolver: { chain_id: 1, address: resolver },
          inventory: inventory({ known_keys: ['text:url'] }),
        }),
      )
      events.mockReturnValue(
        recordEvents(['interface:0x12345678', 'name'], null),
      )

      const result = await optimizedRead([{ ...source('alice.eth'), resolver }])

      expect(lookup).not.toHaveBeenCalled()
      expect(resolverRecords).toHaveBeenCalledWith(
        1,
        resolver.toLowerCase(),
        { name: 'alice.eth', include: ['inventory'], keys: ['contenthash'] },
        { signal: undefined },
      )
      expect(result._unsafeUnwrap()).toEqual([
        {
          id: namehash('alice.eth'),
          texts: ['url'],
          coinTypes: [],
          hasContentHash: false,
          abiContentTypes: [],
          interfaceIds: ['0x12345678'],
          hasName: true,
        },
      ])
    },
  )

  it('only sends compatible source names to a mixed bulk lookup', async () => {
    const resolver = '0x0000000000000000000000000000000000001234'
    lookup.mockReturnValue(bulkAnswer(['alice.eth']))
    resolverRecords.mockReturnValue(
      answer({ inventory: inventory({ known_keys: ['text:source-only'] }) }),
    )

    const result = await optimizedRead([
      source('alice.eth'),
      { ...source('bob.eth'), resolver },
    ])

    expect(lookup.mock.calls[0]?.[0].inputs).toEqual([
      { id: '0', name: 'alice.eth' },
    ])
    expect(
      result._unsafeUnwrap().map(({ id, texts }) => ({ id, texts })),
    ).toEqual([
      { id: namehash('alice.eth'), texts: ['url'] },
      { id: namehash('bob.eth'), texts: ['source-only'] },
    ])
    expect(resolverRecords).toHaveBeenCalledTimes(1)
    expect(events).toHaveBeenCalledTimes(2)
  })

  it('still blocks DNS found in history when a bulk profile is available', async () => {
    lookup.mockReturnValue(bulkAnswer(['alice.eth']))
    resolverRecords.mockReturnValue(answer())
    events.mockReturnValue(recordEvents(['dns:zonehash'], null))

    const result = await optimizedRead([source('alice.eth')])

    expect(result._unsafeUnwrapErr().cause).toMatchObject({
      ensName: 'alice.eth',
      recordType: 'dns',
    })
  })

  it('independently reads the requested source when lookup serves another resolver', async () => {
    lookup.mockReturnValue(
      bulkAnswer(['alice.eth'], {
        resolver: {
          chain_id: 11155111,
          address: '0x0000000000000000000000000000000000001234',
        },
      }),
    )
    resolverRecords.mockReturnValue(
      answer({ inventory: inventory({ known_keys: ['text:source-only'] }) }),
    )

    const result = await optimizedRead([source('alice.eth')])

    expect(result._unsafeUnwrap()[0]?.texts).toEqual(['source-only'])
    expect(resolverRecords).toHaveBeenCalledTimes(1)
  })

  it('does not let bulk keys authorize a profile when supplemental history is incomplete', async () => {
    lookup.mockReturnValue(bulkAnswer(['alice.eth']))
    events.mockReturnValue(recordEvents([], null, { completeness: 'partial' }))

    const result = await optimizedRead([source('alice.eth')])

    expect(result._unsafeUnwrapErr().cause).toMatchObject({
      code: 'unsupported',
    })
    expect(resolverRecords).not.toHaveBeenCalled()
  })

  it('stops before any source or history fallback when cancelled during the bulk read', async () => {
    const controller = new AbortController()
    lookup.mockImplementationOnce(() => {
      controller.abort()
      return bulkAnswer(['alice.eth'])
    })

    const result = await optimizedRead([source('alice.eth')], {
      signal: controller.signal,
    })

    expect(result._unsafeUnwrapErr().cause).toBe(controller.signal.reason)
    expect(resolverRecords).not.toHaveBeenCalled()
    expect(events).not.toHaveBeenCalled()
  })

  it.each([
    '0xda1756bb923af5d1a05e277cb1e54f1d0a127890',
    '0xf58d55f06bb92f083e78bb5063a2dd3544f9b6a3',
  ] as const)(
    'copies ETH but refuses a stored name on address-only resolver %s without an indexer',
    async (resolver) => {
      chain.id = 1
      resolverRecords.mockReturnValue(
        errAsync(new BignameError({ code: 'overloaded', message: 'offline' })),
      )
      events.mockReturnValue(
        errAsync(new BignameError({ code: 'overloaded', message: 'offline' })),
      )
      let storedName = ''
      const publicClient = {
        chain,
        multicall: vi.fn(async () => [
          {
            status: 'success',
            result: '0x0000000000000000000000000000000000001234',
          },
          { status: 'success', result: storedName },
        ]),
      } as unknown as PublicClient
      const names = [
        {
          name: 'alice.eth',
          nodeHex: namehash('alice.eth'),
          v1ResolverAddress: resolver,
        },
      ]

      const profiles = await fetchV1Profiles({ names, publicClient })

      expect(profiles.get(namehash('alice.eth'))?.addresses).toEqual([
        { coinType: 60n, value: '0x0000000000000000000000000000000000001234' },
      ])
      expect(resolverRecords).not.toHaveBeenCalled()
      expect(events).not.toHaveBeenCalled()
      storedName = 'keep-me.eth'
      await expect(
        fetchV1Profiles({ names, publicClient }),
      ).rejects.toMatchObject({
        name: 'UnsupportedResolverRecordsError',
        ensName: 'alice.eth',
        recordType: 'name',
      })
    },
  )

  it('reads known and unset keys from the source resolver', async () => {
    resolverRecords.mockReturnValue(
      answer({
        inventory: inventory({
          known_keys: [
            'text:avatar',
            'addr:60',
            'addr:2147483658',
            'contenthash',
          ],
          unset_keys: ['text:com.github', 'addr:bogus'],
          abi_content_types: ['1', '4'],
        }),
      }),
    )

    const result = await getV1ProfileKeys([source('alice.eth')])

    expect(resolverRecords).toHaveBeenCalledWith(
      11155111,
      RESOLVER,
      {
        name: 'alice.eth',
        include: ['inventory'],
        keys: ['contenthash'],
      },
      { signal: undefined },
    )
    expect(result._unsafeUnwrap()).toEqual([
      {
        id: namehash('alice.eth'),
        texts: ['avatar', 'com.github'],
        coinTypes: [60, 2147483658],
        hasContentHash: true,
        abiContentTypes: [1n, 4n],
        interfaceIds: [],
      },
    ])
  })

  it('lists interface ids from every page of the resolver record events', async () => {
    resolverRecords.mockReturnValue(answer())
    events
      .mockReturnValueOnce(
        recordEvents(['interface:0x01FFC9A7', 'text:url'], 'page-2'),
      )
      .mockReturnValueOnce(
        recordEvents(
          ['interface:0x01ffc9a7', 'interface:0x12345678', 'name'],
          null,
        ),
      )

    const [keys] = (
      await getV1ProfileKeys([source('alice.eth')])
    )._unsafeUnwrap()

    expect(events).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        name: 'alice.eth',
        resolver: `11155111:${RESOLVER}`,
        type: ['record'],
      }),
      expect.anything(),
    )
    expect(events).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ cursor: 'page-2' }),
      expect.anything(),
    )
    expect(keys?.interfaceIds).toEqual(['0x01ffc9a7', '0x12345678'])
    expect(keys?.hasName).toBe(true)
  })

  // Bigname's ENSv1 decoder emits dns:<resource>:<wire-name> for both
  // DNSRecordChanged and DNSRecordDeleted; DNSZonehashChanged uses dns:zonehash.
  it.each(['dns:1:0x03666f6f00', 'dns:zonehash'])(
    'refuses a later history page containing %s and identifies the name',
    async (key) => {
      resolverRecords.mockReturnValue(answer())
      events
        .mockReturnValueOnce(recordEvents(['text:url'], 'page-2'))
        .mockReturnValueOnce(recordEvents([key], null))

      const result = await getV1ProfileKeys([source('dns-owner.eth')])

      expect(result._unsafeUnwrapErr().cause).toMatchObject({
        name: 'UnsupportedResolverRecordsError',
        ensName: 'dns-owner.eth',
        recordType: 'dns',
      })
      expect(events).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ cursor: 'page-2' }),
        expect.anything(),
      )
    },
  )

  it.each([
    { completeness: 'partial' },
    { as_of_completeness: { '11155111': { completeness: 'partial' } } },
  ])('refuses explicitly incomplete history: %j', async (meta) => {
    resolverRecords.mockReturnValue(answer())
    events.mockReturnValue(recordEvents([], null, meta))

    const result = await getV1ProfileKeys([source('alice.eth')])

    expect(result._unsafeUnwrapErr().cause).toMatchObject({
      code: 'unsupported',
      message:
        'Incomplete resolver record history cannot establish safe migration',
      details: { ensName: 'alice.eth' },
    })
  })

  it('counts a contenthash the answer serves even when the inventory omits it', async () => {
    const resolver = '0x0000000000000000000000000000000000001234'
    resolverRecords.mockImplementation((_chain, _resolver, query) =>
      answer({
        resolver: { chain_id: chain.id, address: resolver },
        records:
          query.values === false
            ? {}
            : { contenthash: { status: 'ok', value: '0xe301' } },
      }),
    )

    const [keys] = (
      await getV1ProfileKeys([{ ...source('alice.eth'), resolver }])
    )._unsafeUnwrap()

    expect(keys?.hasContentHash).toBe(true)
  })

  it('preserves the on-chain contenthash probe when inventory-only responses contain no values', async () => {
    resolverRecords.mockImplementation((_chain, _resolver, query) =>
      answer({
        records:
          query.values === false
            ? {}
            : { contenthash: { status: 'ok', value: '0xe301' } },
      }),
    )
    const keys = (await optimizedRead([source('alice.eth')]))._unsafeUnwrap()
    const node = namehash('alice.eth')
    const plan = buildProfileMulticallPlan(
      keys,
      new Map([
        [
          node,
          { name: 'alice.eth', nodeHex: node, v1ResolverAddress: RESOLVER },
        ],
      ]),
      chain.id,
    )

    expect(plan.contracts.map(({ functionName }) => functionName)).toContain(
      'contenthash',
    )
  })

  it('leaves out a name without an inventory or not indexed at the resolver', async () => {
    resolverRecords
      .mockReturnValueOnce(answer())
      .mockReturnValueOnce(answer({ inventory: undefined }))
      .mockReturnValueOnce(
        errAsync(new BignameError({ code: 'not_found', message: 'none' })),
      )

    const keys = (
      await getV1ProfileKeys([
        source('alice.eth'),
        source('bob.eth'),
        source('carol.eth'),
      ])
    )._unsafeUnwrap()

    expect(keys).toEqual([
      {
        id: namehash('alice.eth'),
        texts: [],
        coinTypes: [],
        hasContentHash: false,
        abiContentTypes: [],
        interfaceIds: [],
      },
    ])
  })

  it('leaves out names with unavailable ABI inventories so migration fails closed', async () => {
    resolverRecords.mockReturnValue(
      answer({
        inventory: inventory({
          abi_content_types: null,
          abi_unsupported_reason: 'inventory_not_available',
        }),
      }),
    )

    const keys = (await getV1ProfileKeys([source('alice.eth')]))._unsafeUnwrap()

    expect(keys).toEqual([])
    const multicall = vi.fn(async () => [])
    await expect(
      fetchV1Profiles({
        names: [
          {
            name: 'alice.eth',
            nodeHex: namehash('alice.eth'),
            v1ResolverAddress: RESOLVER,
          },
        ],
        publicClient: { multicall } as unknown as PublicClient,
      }),
    ).rejects.toBeInstanceOf(ProfileFetchError)
    expect(multicall).not.toHaveBeenCalled()
  })

  it('copies enumerated ABI types beyond the four conventional encodings', async () => {
    resolverRecords.mockReturnValue(
      answer({
        inventory: inventory({
          abi_content_types: [
            '16',
            '57896044618658097711785492504343953926634992332820282019728792003956564819968',
          ],
        }),
      }),
    )
    const multicall = vi.fn(async () => [
      { status: 'success', result: [16n, '0x1234'] },
      { status: 'success', result: [1n << 255n, '0xabcd'] },
      { status: 'success', result: [zeroHash, zeroHash] },
    ])

    const profiles = await fetchV1Profiles({
      names: [
        {
          name: 'alice.eth',
          nodeHex: namehash('alice.eth'),
          v1ResolverAddress: RESOLVER,
        },
      ],
      publicClient: { multicall } as unknown as PublicClient,
    })

    expect(profiles.get(namehash('alice.eth'))?.abis).toEqual([
      { contentType: 16n, value: '0x1234' },
      { contentType: 1n << 255n, value: '0xabcd' },
    ])
  })

  it('fails when bigname cannot answer', async () => {
    resolverRecords.mockReturnValue(
      errAsync(new BignameError({ code: 'overloaded', message: 'busy' })),
    )

    const result = await getV1ProfileKeys([source('alice.eth')])

    expect(result._unsafeUnwrapErr()._tag).toBe('GetV1ProfilesError')
  })
})
