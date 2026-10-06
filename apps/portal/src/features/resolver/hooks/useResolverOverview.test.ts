import { BignameError } from '@ens-apps/bigname'
import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import {
  getResolverNodesQueryOptions,
  getResolverOverviewQueryOptions,
  powersToResolverRoleBitmap,
  pruneLinksAfterUnlink,
  resolverCollectionCount,
  toLinks,
} from './useResolverOverview'

const bigname = vi.hoisted(() => ({
  getResolver: vi.fn(),
  listResolverLinks: vi.fn(),
  listResolverRoles: vi.fn(),
  listEvents: vi.fn(),
}))
vi.mock('@/lib/bigname', () => ({ bigname }))

// One entry per bigname `/links` row: the current name -> record_id mapping
// built from `Linked` events.
const entry = (...names: { name: string; recordId: string }[]) =>
  names.map((n) => ({
    name: n.name,
    namehash: `0x${n.name.length.toString(16).padStart(64, '0')}`,
    recordId: n.recordId,
  }))

describe('toLinks', () => {
  it('returns nothing when there is no data', () => {
    expect(toLinks([])).toEqual([])
  })

  it('ignores a record used by a single name', () => {
    expect(
      toLinks([
        ...entry({ name: 'a.eth', recordId: '1' }),
        ...entry({ name: 'b.eth', recordId: '2' }),
      ]),
    ).toEqual([])
  })

  it('pairs the names that share a record, each listing the others', () => {
    const links = toLinks([
      ...entry({ name: 'a.eth', recordId: '7' }),
      ...entry({ name: 'b.eth', recordId: '7' }),
      ...entry({ name: 'solo.eth', recordId: '9' }),
    ])

    expect(links).toHaveLength(2)
    expect(links.map((l) => l.name).toSorted()).toEqual(['a.eth', 'b.eth'])
    expect(links.find((l) => l.name === 'a.eth')?.sharedWith).toEqual(['b.eth'])
    expect(links.find((l) => l.name === 'b.eth')?.sharedWith).toEqual(['a.eth'])
    expect(links.every((l) => l.recordId === '7')).toBe(true)
  })

  it('handles more than two names on one record', () => {
    const links = toLinks(
      entry(
        { name: 'a.eth', recordId: '3' },
        { name: 'b.eth', recordId: '3' },
        { name: 'c.eth', recordId: '3' },
      ),
    )

    expect(links).toHaveLength(3)
    expect(
      links.find((l) => l.name === 'b.eth')?.sharedWith.toSorted(),
    ).toEqual(['a.eth', 'c.eth'])
  })
})

describe('pruneLinksAfterUnlink', () => {
  const linksFor = (...entries: [string, string[]][]) =>
    entries.map(([name, sharedWith]) => ({
      name,
      namehash: '0x00',
      recordId: '7',
      sharedWith,
    }))

  it('clears both rows when one of a pair is unlinked', () => {
    const links = linksFor(['a.eth', ['b.eth']], ['b.eth', ['a.eth']])
    expect(pruneLinksAfterUnlink(links, 'a.eth')).toEqual([])
  })

  it('keeps the rest of a larger group and drops the unlinked name from it', () => {
    const links = linksFor(
      ['a.eth', ['b.eth', 'c.eth']],
      ['b.eth', ['a.eth', 'c.eth']],
      ['c.eth', ['a.eth', 'b.eth']],
    )
    const pruned = pruneLinksAfterUnlink(links, 'a.eth')

    expect(pruned.map((l) => l.name)).toEqual(['b.eth', 'c.eth'])
    expect(pruned.every((l) => !l.sharedWith.includes('a.eth'))).toBe(true)
    expect(pruned.find((l) => l.name === 'b.eth')?.sharedWith).toEqual([
      'c.eth',
    ])
  })

  it('leaves unrelated groups alone', () => {
    const links = [
      ...linksFor(['a.eth', ['b.eth']], ['b.eth', ['a.eth']]),
      { name: 'x.eth', namehash: '0x00', recordId: '9', sharedWith: ['y.eth'] },
      { name: 'y.eth', namehash: '0x00', recordId: '9', sharedWith: ['x.eth'] },
    ]
    expect(pruneLinksAfterUnlink(links, 'a.eth').map((l) => l.name)).toEqual([
      'x.eth',
      'y.eth',
    ])
  })
})

describe('powersToResolverRoleBitmap', () => {
  it('re-encodes bigname powers as the resolver role bitmap', () => {
    // ROLE_SET_ADDRESS is nybble 0, ROLE_SET_TEXT nybble 1, admins +128 bits.
    expect(powersToResolverRoleBitmap(['set_addr', 'set_text'])).toBe(0x11n)
    expect(powersToResolverRoleBitmap(['admin_set_addr'])).toBe(1n << 128n)
  })

  it('drops powers with no bit on this resolver generation', () => {
    expect(powersToResolverRoleBitmap(['set_pubkey', 'clear_records'])).toBe(0n)
  })
})

const RESOLVER = '0x00000000000000000000000000000000000000Ab'
const HOLDER = '0x1111111111111111111111111111111111111111'

const page = <T>(data: T[], total: number | null = data.length) => ({
  data,
  page: {
    cursor: null,
    next_cursor: null,
    page_size: 200,
    total_count: total,
    has_more: false,
  },
  meta: {},
})

describe('getResolverOverviewQueryOptions', () => {
  const read = () => {
    return new QueryClient().fetchQuery(
      getResolverOverviewQueryOptions({ address: RESOLVER }),
    )
  }

  it('assembles the overview from bound names, links, roles and events', async () => {
    bigname.getResolver.mockResolvedValue({
      data: {
        chain_id: 11155111,
        address: RESOLVER.toLowerCase(),
        bound_names: page(
          [
            {
              status: 'ok',
              name: 'a.eth',
              display_name: 'a.eth',
              namespace: 'ens',
              namehash: '0xaa',
              owner: HOLDER,
            },
          ],
          12,
        ),
      },
      meta: {},
    })
    bigname.listResolverLinks.mockResolvedValue(
      page([
        {
          record_id: '0',
          namehash: '0x00',
          default: true,
          link_event: { block_number: 1 },
        },
        {
          record_id: '7',
          namehash: '0xaa',
          default: false,
          name: 'a.eth',
          link_event: { block_number: 1 },
        },
        {
          record_id: '7',
          namehash: '0xbb',
          default: false,
          name: 'b.eth',
          link_event: { block_number: 1 },
        },
      ]),
    )
    bigname.listResolverRoles.mockResolvedValue(
      page([
        { address: HOLDER, registration_id: 'r1', powers: ['set_addr'] },
        {
          address: HOLDER,
          registration_id: 'r2',
          powers: ['set_text'],
          record_resource: { kind: 'text', hash: '0x10', key: 'avatar' },
          grant_event: {
            block_number: 5,
            timestamp: '1781049606',
            transaction_hash: '0xfeed',
          },
        },
      ]),
    )
    bigname.listEvents.mockResolvedValue(
      page(
        [
          {
            id: 'e1',
            type: 'record',
            kind: 'RecordChanged',
            block_number: 9,
            timestamp: '1781049606',
            transaction_hash: '0xabc',
            data: { key: 'text:avatar', value: 'x' },
          },
        ],
        40,
      ),
    )

    const overview = (await read()) as Record<string, unknown>

    expect(bigname.listEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        resolver: { chain_id: 11155111, address: RESOLVER.toLowerCase() },
      }),
      { signal: expect.any(AbortSignal) },
    )
    expect(overview).toMatchObject({
      nodeCount: 12,
      nodeCountIsLowerBound: false,
      linkCount: 2,
      roleHolderCount: 1,
      roles: [
        {
          account: HOLDER,
          resource: null,
          roleBitmap: '1',
          registrationId: 'r1',
        },
        {
          account: HOLDER,
          resource: '16',
          roleBitmap: '16',
          blockNumber: 5,
          transactionHash: '0xfeed',
          timestamp: 1_781_049_606,
        },
      ],
      namedResources: [
        {
          resource: '16',
          recordKind: 'text',
          recordKey: 'avatar',
          coinType: null,
        },
      ],
      events: [
        {
          id: 'e1',
          type: 'RecordChanged',
          blockNumber: 9,
          data: JSON.stringify({ key: 'text:avatar', value: 'x' }),
        },
      ],
      eventCount: 40,
    })
  })

  const mockEmptyOverview = () => {
    bigname.getResolver.mockResolvedValue({
      data: {
        chain_id: 11155111,
        address: RESOLVER.toLowerCase(),
        bound_names: page([]),
      },
      meta: {},
    })
    bigname.listResolverLinks.mockReset().mockResolvedValue(page([]))
    bigname.listResolverRoles.mockReset().mockResolvedValue(page([]))
    bigname.listEvents.mockResolvedValue(page([]))
  }

  it('does not infer root from an admin-only or undecoded grant', async () => {
    mockEmptyOverview()
    bigname.listResolverRoles.mockResolvedValue(
      page([
        {
          address: HOLDER,
          registration_id: 'scoped-admin',
          powers: ['admin_set_text'],
        },
        {
          address: HOLDER,
          registration_id: 'unknown-argument',
          powers: ['link'],
        },
      ]),
    )
    expect((await read())?.roles).toMatchObject([
      { registrationId: 'scoped-admin', resource: null },
      { registrationId: 'unknown-argument', resource: null },
    ])
  })

  it('keeps unsupported collections unknown instead of reporting zero', async () => {
    mockEmptyOverview()
    const unsupported = {
      ...page([], null),
      meta: {
        completeness: 'unsupported',
        unsupported_reason: 'resolver_overview_not_supported',
      },
    }
    bigname.listResolverLinks.mockResolvedValue(unsupported)
    bigname.listResolverRoles.mockResolvedValue(unsupported)
    expect(await read()).toMatchObject({
      linkCount: null,
      roleHolderCount: null,
      linksStatus: 'unsupported',
      rolesStatus: 'unsupported',
      links: [],
      roles: [],
    })
  })

  it('retains partial coverage from an earlier page and keeps known rows', async () => {
    mockEmptyOverview()
    const first = page([
      { address: HOLDER, registration_id: 'r1', powers: ['set_text'] },
    ])
    bigname.listResolverRoles
      .mockResolvedValueOnce({
        ...first,
        page: { ...first.page, has_more: true, next_cursor: 'next' },
        meta: { completeness: 'partial' },
      })
      .mockResolvedValueOnce(page([]))
    expect(await read()).toMatchObject({
      roleHolderCount: 1,
      rolesStatus: 'partial',
      linksStatus: 'full',
      linkCount: 0,
    })
  })

  it('reads all links and roles past their old row caps and the default page limit', async () => {
    const total = 20_200
    bigname.getResolver.mockResolvedValue({
      data: {
        chain_id: 11155111,
        address: RESOLVER.toLowerCase(),
        bound_names: page([]),
      },
      meta: {},
    })
    bigname.listEvents.mockResolvedValue(page([]))
    const collection = <T>(
      cursor: string | undefined,
      makeRow: (index: number) => T,
    ) => {
      const offset = Number(cursor ?? 0)
      const response = page(
        Array.from({ length: 200 }, (_, i) => makeRow(offset + i)),
        total,
      )
      const next = offset + 200 < total ? String(offset + 200) : null
      return {
        ...response,
        page: { ...response.page, next_cursor: next, has_more: next !== null },
      }
    }
    bigname.listResolverLinks
      .mockReset()
      .mockImplementation(async (_chain, _address, { cursor }) =>
        collection(cursor, (i) => ({
          name: `${i}.eth`,
          namehash: `0x${i}`,
          record_id: String(Math.floor(i / 2)),
          default: false,
        })),
      )
    bigname.listResolverRoles
      .mockReset()
      .mockImplementation(async (_chain, _address, { cursor }) =>
        collection(cursor, () => ({
          address: HOLDER,
          powers: ['set_text'],
        })),
      )

    const overview = await read()
    expect(overview?.links).toHaveLength(total)
    expect(overview?.linkCount).toBe(total)
    expect(overview?.links.at(-1)?.sharedWith).toEqual(['20198.eth'])
    expect(overview?.roles).toHaveLength(total)
    expect(bigname.listResolverLinks).toHaveBeenCalledTimes(101)
    expect(bigname.listResolverRoles).toHaveBeenCalledTimes(101)
  })

  it('counts the first page as a lower bound when bigname gives no total', async () => {
    bigname.getResolver.mockResolvedValue({
      data: {
        chain_id: 11155111,
        address: RESOLVER.toLowerCase(),
        bound_names: {
          data: [{ name: 'a.eth' }, { name: 'b.eth' }],
          page: {
            cursor: null,
            next_cursor: 'more',
            page_size: 200,
            total_count: null,
            has_more: true,
          },
        },
      },
      meta: {},
    })
    bigname.listResolverLinks.mockResolvedValue(page([]))
    bigname.listResolverRoles.mockResolvedValue(page([]))
    bigname.listEvents.mockResolvedValue(page([]))

    expect(await read()).toMatchObject({
      nodeCount: 2,
      nodeCountIsLowerBound: true,
    })
  })

  it('answers null for a resolver bigname has no overview of', async () => {
    bigname.getResolver.mockResolvedValue(null)
    bigname.listResolverLinks.mockResolvedValue(page([], null))
    bigname.listResolverRoles.mockResolvedValue(page([], null))
    bigname.listEvents.mockResolvedValue(page([], 0))
    expect(await read()).toBeNull()
  })
})

describe('getResolverNodesQueryOptions', () => {
  const read = () => {
    return new QueryClient().fetchQuery(
      getResolverNodesQueryOptions({ address: RESOLVER }),
    )
  }

  const boundPage = (names: string[], next: string | null) => ({
    data: {
      chain_id: 11155111,
      address: RESOLVER.toLowerCase(),
      bound_names: {
        data: names.map((name) => ({
          status: 'ok',
          name,
          display_name: name,
          namespace: 'ens',
          namehash: `0x${name.length}`,
          owner: HOLDER,
        })),
        page: {
          cursor: null,
          next_cursor: next,
          page_size: 200,
          total_count: null,
          has_more: next !== null,
        },
      },
    },
    meta: {},
  })

  const clientWithFreshCache = () =>
    new QueryClient({
      defaultOptions: { queries: { staleTime: 60_000, retry: false } },
    })

  const mockOverviewCollections = () => {
    bigname.listResolverLinks.mockReset().mockResolvedValue(page([]))
    bigname.listResolverRoles.mockReset().mockResolvedValue(page([]))
    bigname.listEvents.mockReset().mockResolvedValue(page([]))
  }

  it('shares one first-page request between concurrent overview and Nodes consumers', async () => {
    const client = clientWithFreshCache()
    mockOverviewCollections()
    bigname.getResolver
      .mockReset()
      .mockResolvedValue(boundPage(['a.eth'], null))
    const [overview, nodes] = await Promise.all([
      client.fetchQuery(getResolverOverviewQueryOptions({ address: RESOLVER })),
      client.fetchQuery(getResolverNodesQueryOptions({ address: RESOLVER })),
    ])
    expect(overview?.nodeCount).toBe(1)
    expect(nodes.nodes.map(({ name }) => name)).toEqual(['a.eth'])
    expect(bigname.getResolver).toHaveBeenCalledTimes(1)
    expect(bigname.listResolverLinks).toHaveBeenCalledTimes(1)
    expect(bigname.listResolverRoles).toHaveBeenCalledTimes(1)
    expect(bigname.listEvents).toHaveBeenCalledTimes(1)
  })

  it.each([
    'overview',
    'nodes',
  ] as const)('reuses a fresh first page when %s loaded first', async (first) => {
    const client = clientWithFreshCache()
    mockOverviewCollections()
    bigname.getResolver
      .mockReset()
      .mockResolvedValue(boundPage(['a.eth'], null))
    const overview = () =>
      client.fetchQuery(getResolverOverviewQueryOptions({ address: RESOLVER }))
    const nodes = () =>
      client.fetchQuery(getResolverNodesQueryOptions({ address: RESOLVER }))
    if (first === 'overview') {
      await overview()
      await nodes()
    } else {
      await nodes()
      expect(bigname.listResolverLinks).not.toHaveBeenCalled()
      expect(bigname.listResolverRoles).not.toHaveBeenCalled()
      expect(bigname.listEvents).not.toHaveBeenCalled()
      await overview()
    }
    expect(bigname.getResolver).toHaveBeenCalledTimes(1)
  })

  it('refreshes the shared page when the overview is invalidated', async () => {
    const client = clientWithFreshCache()
    mockOverviewCollections()
    bigname.getResolver
      .mockReset()
      .mockResolvedValueOnce(boundPage(['old.eth'], null))
      .mockResolvedValueOnce(boundPage(['new.eth', 'newer.eth'], null))
    const options = getResolverOverviewQueryOptions({ address: RESOLVER })
    await client.fetchQuery(options)
    await client.invalidateQueries({
      queryKey: ['resolver-overview'],
      refetchType: 'all',
    })
    expect(client.getQueryData(options.queryKey)?.nodeCount).toBe(2)
    expect(bigname.getResolver).toHaveBeenCalledTimes(2)
  })

  it('refreshes the shared page when Nodes is explicitly refetched', async () => {
    const client = clientWithFreshCache()
    bigname.getResolver
      .mockReset()
      .mockResolvedValueOnce(boundPage(['old.eth'], null))
      .mockResolvedValueOnce(boundPage(['new.eth'], null))
    const options = getResolverNodesQueryOptions({ address: RESOLVER })
    await client.fetchQuery(options)
    await client.refetchQueries({ queryKey: options.queryKey })
    expect(
      client.getQueryData(options.queryKey)?.nodes.map(({ name }) => name),
    ).toEqual(['new.eth'])
    expect(bigname.getResolver).toHaveBeenCalledTimes(2)
  })

  it('discards a cached first page after a stale continuation and fetches a fresh snapshot', async () => {
    const client = clientWithFreshCache()
    mockOverviewCollections()
    bigname.getResolver
      .mockReset()
      .mockResolvedValueOnce(boundPage(['old.eth'], 'old-cursor'))
      .mockRejectedValueOnce(
        new BignameError({
          status: 409,
          code: 'stale',
          message: 'snapshot changed',
        }),
      )
      .mockResolvedValueOnce(boundPage(['new.eth'], 'new-cursor'))
      .mockResolvedValueOnce(boundPage(['newer.eth'], null))
    await client.fetchQuery(
      getResolverOverviewQueryOptions({ address: RESOLVER }),
    )
    const nodes = await client.fetchQuery(
      getResolverNodesQueryOptions({ address: RESOLVER }),
    )
    expect(nodes.nodes.map(({ name }) => name)).toEqual([
      'new.eth',
      'newer.eth',
    ])
    expect(nodes.partial).toBe(false)
    expect(
      bigname.getResolver.mock.calls.map(([, , params]) => params.cursor),
    ).toEqual([undefined, 'old-cursor', undefined, 'new-cursor'])
  })

  it('reads nodes past the old row cap and the default page limit, sharing the overview first page', async () => {
    const client = clientWithFreshCache()
    const total = 20_200
    mockOverviewCollections()
    bigname.getResolver
      .mockReset()
      .mockImplementation(
        async (_chain, _address, { cursor }: { cursor?: string }) => {
          const offset = Number(cursor ?? 0)
          return boundPage(
            Array.from({ length: 200 }, (_, i) => `${offset + i}.eth`),
            offset + 200 < total ? String(offset + 200) : null,
          )
        },
      )
    await client.fetchQuery(
      getResolverOverviewQueryOptions({ address: RESOLVER }),
    )
    const nodes = await client.fetchQuery(
      getResolverNodesQueryOptions({ address: RESOLVER }),
    )
    expect(nodes.nodes).toHaveLength(total)
    expect(nodes.nodes.at(-1)?.name).toBe('20199.eth')
    expect(nodes).toMatchObject({ truncated: false, partial: false })
    expect(bigname.getResolver).toHaveBeenCalledTimes(101)
  })

  it('pages bound names past the overview’s first page', async () => {
    bigname.getResolver.mockReset()
    bigname.getResolver
      .mockResolvedValueOnce(boundPage(['a.eth'], 'c2'))
      .mockResolvedValueOnce(boundPage(['bb.eth'], null))

    const result = await read()

    expect(result.nodes.map(({ name }) => name)).toEqual(['a.eth', 'bb.eth'])
    expect(result.truncated).toBe(false)
    expect(bigname.getResolver).toHaveBeenLastCalledWith(
      11155111,
      RESOLVER.toLowerCase(),
      { page_size: 200, cursor: 'c2' },
      { signal: expect.any(AbortSignal) },
    )
  })

  it('keeps fetched nodes and marks the result partial when a continuation times out', async () => {
    bigname.getResolver.mockReset()
    bigname.getResolver
      .mockResolvedValueOnce(boundPage(['a.eth'], 'more'))
      .mockRejectedValueOnce(
        new BignameError({
          status: 408,
          code: 'request_timeout',
          message: 'timeout',
        }),
      )
    expect(await read()).toMatchObject({
      nodes: [{ name: 'a.eth' }],
      truncated: true,
      partial: true,
    })
  })

  it('lists no nodes for a resolver bigname does not know', async () => {
    bigname.getResolver.mockReset()
    bigname.getResolver.mockResolvedValue(null)
    expect(await read()).toEqual({
      nodes: [],
      truncated: false,
      partial: false,
    })
  })
})

describe('resolverCollectionCount', () => {
  it('distinguishes a known empty collection from unavailable or partial coverage', () => {
    expect(resolverCollectionCount(0, 'full')).toBe('0')
    expect(resolverCollectionCount(null, 'unsupported')).toBe('Unknown')
    expect(resolverCollectionCount(0, 'partial')).toBe('0+')
    expect(resolverCollectionCount(12, 'partial')).toBe('12+')
  })
})
