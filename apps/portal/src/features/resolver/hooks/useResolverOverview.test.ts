import { IndexerReadError, type IndexerReadErrorKind } from '@ens-apps/indexer'
import { QueryClient } from '@tanstack/react-query'
import { errAsync, okAsync } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  formatRoleHolderCount,
  getResolverNodesQueryOptions,
  getResolverOverviewQueryOptions,
  invalidateResolverOverview,
  powersToResolverRoleBitmap,
  pruneLinksAfterUnlink,
  resolverCollectionCount,
  toLinks,
} from './useResolverOverview'

const indexer = vi.hoisted(() => ({
  getResolver: vi.fn(),
  getResolverLinks: vi.fn(),
  getResolverRoles: vi.fn(),
  getEvents: vi.fn(),
}))
vi.mock('@/lib/indexer', () => ({ indexer }))

// One entry per indexer links row: the current name -> record_id mapping
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

const ADDRESS = '0x231B0Ee14048e9dCcD1d247744d114a4EB5E8E63'
const RESOLVER = ADDRESS.toLowerCase()
const HOLDER = '0x8e8d000000000000000000000000000000003216'
const REGISTRY = '0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e'

const page = <T>(
  items: readonly T[],
  {
    next = null,
    total = items.length,
    completeness = 'full',
  }: {
    readonly next?: string | null
    readonly total?: number | null
    readonly completeness?: 'full' | 'partial' | 'unsupported'
  } = {},
) => okAsync({ items, nextCursor: next, totalCount: total, completeness })

const overview = (
  names: readonly string[],
  {
    next = null,
    total = null,
    mirrorRegistry = null,
  }: {
    readonly next?: string | null
    readonly total?: number | null
    readonly mirrorRegistry?: string | null
  } = {},
) =>
  okAsync({
    address: RESOLVER,
    mirrorRegistry,
    boundNames: {
      items: names.map((name) => ({
        name,
        namehash: `0x${name.length.toString(16).padStart(64, '0')}`,
        owner: HOLDER,
      })),
      nextCursor: next,
      totalCount: total,
    },
  })

const link = (name: string, recordId: string) => ({
  recordId,
  namehash: `0x${name.length.toString(16).padStart(64, '0')}`,
  isDefault: false,
  name,
})

const role = (overrides: Record<string, unknown> = {}) => ({
  account: HOLDER,
  registrationId: 'registration-1',
  powers: ['set_addr', 'set_text'],
  eacResource: '0',
  recordResource: null,
  name: null,
  grantedAt: {
    blockNumber: 11833373,
    timestamp: new Date(1790999568 * 1000),
    transactionHash: '0xabc',
  },
  ...overrides,
})

const readError = (kind: IndexerReadErrorKind) =>
  errAsync(new IndexerReadError({ kind, message: kind, cause: undefined }))

const readOverview = () =>
  new QueryClient().fetchQuery(
    getResolverOverviewQueryOptions({ address: ADDRESS }),
  )

describe('getResolverOverviewQueryOptions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    indexer.getResolver.mockReturnValue(overview(['juveniles.eth']))
    indexer.getResolverLinks.mockReturnValue(page([]))
    indexer.getResolverRoles.mockReturnValue(page([]))
    indexer.getEvents.mockReturnValue(page([], { total: 3 }))
  })

  it('reads the overview, links, roles and events of the resolver on the app chain', async () => {
    indexer.getResolverLinks.mockReturnValue(
      page([link('a.eth', '1'), link('b.eth', '1'), link('solo.eth', '2')]),
    )
    indexer.getResolverRoles.mockReturnValue(page([role()]))

    const result = await readOverview()

    expect(indexer.getResolver).toHaveBeenCalledWith(
      { address: RESOLVER, pageSize: 100 },
      { signal: expect.any(AbortSignal) },
    )
    expect(indexer.getEvents).toHaveBeenCalledWith(
      expect.objectContaining({ resolver: RESOLVER }),
      { signal: expect.any(AbortSignal) },
    )
    expect(result).toMatchObject({
      address: RESOLVER,
      nodeCount: 1,
      nodeCountIsLowerBound: false,
      mirrorRegistry: null,
      linkCount: 2,
      linksStatus: 'full',
      roleHolderCount: 1,
    })
    expect(result?.links.map(({ name }) => name)).toEqual(['a.eth', 'b.eth'])
    expect(result?.roles[0]).toMatchObject({
      account: HOLDER,
      resource: '0',
      timestamp: 1790999568,
    })
  })

  it('takes a grant’s scope from the indexer’s EAC resource, and leaves it unknown when the indexer does not say', async () => {
    indexer.getResolverRoles.mockReturnValue(
      page([
        role({ eacResource: '42' }),
        role({ eacResource: null, powers: ['admin_set_addr'] }),
      ]),
    )

    const result = await readOverview()

    expect(result?.roles.map(({ resource }) => resource)).toEqual(['42', null])
  })

  it('keeps the weakest coverage any page stated, and never reports an unsupported count', async () => {
    indexer.getResolverLinks.mockReturnValue(
      page([], { total: null, completeness: 'unsupported' }),
    )
    indexer.getResolverRoles
      .mockReturnValueOnce(
        page([role()], { next: 'more', completeness: 'partial' }),
      )
      .mockReturnValueOnce(page([role({ account: '0x1' })]))

    const result = await readOverview()

    expect(result).toMatchObject({
      linkCount: null,
      linksStatus: 'unsupported',
      rolesStatus: 'partial',
      roleHolderCount: 2,
    })
    expect(indexer.getResolverRoles).toHaveBeenLastCalledWith(
      expect.objectContaining({ address: RESOLVER, cursor: 'more' }),
      { signal: expect.any(AbortSignal) },
    )
  })

  it('counts the first page as a lower bound when the indexer gives no total', async () => {
    indexer.getResolver.mockReturnValue(
      overview(['a.eth', 'b.eth'], { next: 'more' }),
    )

    expect(await readOverview()).toMatchObject({
      nodeCount: 2,
      nodeCountIsLowerBound: true,
    })
  })

  it('names the ENSv1 registry a mirror resolver answers through', async () => {
    indexer.getResolver.mockReturnValue(
      overview(['reverse'], { mirrorRegistry: REGISTRY }),
    )

    expect(await readOverview()).toMatchObject({
      nodeCount: 1,
      mirrorRegistry: REGISTRY,
    })
  })

  it('answers null for a resolver the indexer does not know', async () => {
    indexer.getResolver.mockReturnValue(okAsync(null))
    expect(await readOverview()).toBeNull()
  })

  it('answers null for an unknown resolver even when its collections fail', async () => {
    indexer.getResolver.mockReturnValue(okAsync(null))
    indexer.getResolverLinks.mockReturnValue(readError('unavailable'))
    indexer.getResolverRoles.mockReturnValue(readError('unavailable'))
    expect(await readOverview()).toBeNull()
  })

  it('renders without a node count when the indexer cannot serve the bound names', async () => {
    indexer.getResolver.mockReturnValue(readError('unavailable'))
    expect(await readOverview()).toMatchObject({
      nodeCount: null,
      nodeCountIsLowerBound: false,
      linkCount: 0,
    })
  })

  it('skips events with no transaction', async () => {
    const event = (id: string, transactionHash: string | null) => ({
      id,
      type: 'resolver',
      kind: null,
      blockNumber: 1,
      timestamp: new Date(1790999568 * 1000),
      transactionHash,
      data: {},
    })
    indexer.getEvents.mockReturnValue(
      page([event('derived', null), event('emitted', '0xabc')]),
    )
    const { events } = (await readOverview()) ?? {}
    expect(events?.map(({ id }) => id)).toEqual(['emitted'])
  })

  it('reports older events from the page flag, not the page length', async () => {
    const event = (id: string) => ({
      id,
      type: 'resolver',
      kind: null,
      blockNumber: 1,
      timestamp: new Date(1790999568 * 1000),
      transactionHash: '0xabc',
      data: {},
    })
    indexer.getEvents.mockReturnValue(page([event('a')], { next: 'more' }))
    expect(await readOverview()).toMatchObject({ eventsHasMore: true })

    indexer.getEvents.mockReturnValue(page([event('a')]))
    expect(await readOverview()).toMatchObject({ eventsHasMore: false })
  })

  it('renders without recent events when the indexer cannot serve them', async () => {
    indexer.getEvents.mockReturnValue(readError('unavailable'))
    expect(await readOverview()).toMatchObject({ events: null, nodeCount: 1 })
  })

  it('fails when another read fails', async () => {
    indexer.getResolverRoles.mockReturnValue(readError('unavailable'))
    await expect(readOverview()).rejects.toMatchObject({
      _tag: 'GetResolverOverviewError',
    })
  })
})

describe('getResolverNodesQueryOptions', () => {
  const readNodes = () =>
    new QueryClient().fetchInfiniteQuery(
      getResolverNodesQueryOptions({ address: ADDRESS }),
    )

  beforeEach(() => vi.clearAllMocks())

  it('reads one page of bound names, with the cursor to the next', async () => {
    indexer.getResolver.mockReturnValueOnce(
      overview(['a.eth'], { next: 'more' }),
    )

    const { pages } = await readNodes()

    expect(pages).toHaveLength(1)
    expect(pages[0]?.nodes.map(({ name }) => name)).toEqual(['a.eth'])
    expect(pages[0]?.nextCursor).toBe('more')
    expect(indexer.getResolver).toHaveBeenCalledWith(
      { address: RESOLVER, pageSize: 100 },
      { signal: expect.any(AbortSignal) },
    )
  })

  it('passes the cursor when reading the next page', async () => {
    indexer.getResolver
      .mockReturnValueOnce(overview(['a.eth'], { next: 'more' }))
      .mockReturnValueOnce(overview(['b.eth']))

    await new QueryClient().fetchInfiniteQuery({
      ...getResolverNodesQueryOptions({ address: ADDRESS }),
      pages: 2,
    })

    expect(indexer.getResolver).toHaveBeenLastCalledWith(
      { address: RESOLVER, pageSize: 100, cursor: 'more' },
      { signal: expect.any(AbortSignal) },
    )
  })

  it('lists no nodes for a resolver the indexer does not know', async () => {
    indexer.getResolver.mockReturnValue(okAsync(null))

    expect((await readNodes()).pages[0]?.nodes).toEqual([])
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

describe('formatRoleHolderCount', () => {
  it.each([
    { count: 1, status: 'full', expected: '1 role holder' },
    { count: 2, status: 'full', expected: '2 role holders' },
    { count: 1, status: 'partial', expected: '1+ role holders' },
    { count: undefined, status: undefined, expected: 'Role holders unknown' },
  ] as const)(
    '$count ($status) reads $expected',
    ({ count, status, expected }) => {
      expect(formatRoleHolderCount(count, status)).toBe(expected)
    },
  )
})

describe('invalidateResolverOverview', () => {
  it('refreshes the written resolver only', async () => {
    const queryClient = new QueryClient()
    const OTHER = '0x2222222222222222222222222222222222222222'
    const OTHER_CASE = '0x231b0ee14048e9dccd1d247744d114a4eb5e8e63'
    const written = getResolverOverviewQueryOptions({ address: ADDRESS })
    const other = getResolverOverviewQueryOptions({ address: OTHER })
    queryClient.setQueryData(written.queryKey, null)
    queryClient.setQueryData(other.queryKey, null)

    await invalidateResolverOverview(queryClient, OTHER_CASE)

    expect(queryClient.getQueryState(written.queryKey)?.isInvalidated).toBe(
      true,
    )
    expect(queryClient.getQueryState(other.queryKey)?.isInvalidated).toBe(false)
  })

  it('marks this resolver’s role checks stale, so a revoked admin stops gating', async () => {
    const queryClient = new QueryClient()
    const OTHER = '0x1cf3000000000000000000000000000000001acf'
    const rolesKey = [
      'get-resolver-roles-for-account',
      { address: ADDRESS, resource: '0', account: OTHER },
    ]
    const hasRolesKey = [
      'hasRoles',
      { resolverAddress: ADDRESS, roles: ['ROLE_SET_TEXT_ADMIN'] },
    ]
    const otherHasRolesKey = [
      'hasRoles',
      { resolverAddress: OTHER, roles: ['ROLE_SET_TEXT_ADMIN'] },
    ]
    const registryHasRolesKey = ['hasRoles', { registryAddress: ADDRESS }]
    for (const key of [
      rolesKey,
      hasRolesKey,
      otherHasRolesKey,
      registryHasRolesKey,
    ])
      queryClient.setQueryData(key, true)

    await invalidateResolverOverview(queryClient, ADDRESS)

    expect(queryClient.getQueryState(rolesKey)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(hasRolesKey)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(otherHasRolesKey)?.isInvalidated).toBe(
      false,
    )
    expect(queryClient.getQueryState(registryHasRolesKey)?.isInvalidated).toBe(
      false,
    )
  })
})
