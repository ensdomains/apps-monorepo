import { BignameError } from '@ens-apps/indexer/bigname'
import { QueryClient } from '@tanstack/react-query'
import { errAsync, okAsync } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getResolverNodesQueryOptions,
  getResolverOverviewQueryOptions,
  invalidateResolverOverview,
  powersToResolverRoleBitmap,
  pruneLinksAfterUnlink,
  resolverCollectionCount,
  toLinks,
} from './useResolverOverview'

const bigname = vi.hoisted(() => ({
  resolver: vi.fn(),
  resolverLinks: vi.fn(),
  resolverRoles: vi.fn(),
  events: vi.fn(),
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

const ADDRESS = '0x231B0Ee14048e9dCcD1d247744d114a4EB5E8E63'
const RESOLVER = ADDRESS.toLowerCase()
const HOLDER = '0x8e8d000000000000000000000000000000003216'

const page = <T>(
  data: readonly T[],
  {
    next = null,
    total = data.length,
    completeness,
  }: {
    readonly next?: string | null
    readonly total?: number | null
    readonly completeness?: 'full' | 'partial' | 'unsupported'
  } = {},
) =>
  okAsync({
    data,
    page: {
      cursor: null,
      next_cursor: next,
      page_size: 200,
      total_count: total,
      has_more: next !== null,
    },
    meta: { as_of: {}, ...(completeness && { completeness }) },
  })

const overview = (
  names: readonly string[],
  {
    next = null,
    total = null,
  }: { next?: string | null; total?: number | null } = {},
) =>
  okAsync({
    data: {
      chain_id: 11155111,
      address: RESOLVER,
      bound_names: {
        data: names.map((name) => ({
          name,
          display_name: name,
          namespace: 'ens',
          namehash: `0x${name.length.toString(16).padStart(64, '0')}`,
          owner: HOLDER,
          status: 'ok',
        })),
        page: {
          cursor: null,
          next_cursor: next,
          page_size: 200,
          total_count: total,
          has_more: next !== null,
        },
      },
    },
    meta: { as_of: {} },
  })

const link = (name: string, recordId: string) => ({
  record_id: recordId,
  namehash: `0x${name.length.toString(16).padStart(64, '0')}`,
  default: false,
  name,
  display_name: name,
  link_event: { block_number: 1 },
})

const role = (overrides: Record<string, unknown> = {}) => ({
  address: HOLDER,
  registration_id: 'registration-1',
  powers: ['set_addr', 'set_text'],
  eac_resource: '0',
  grant_event: {
    block_number: 11833373,
    timestamp: '1790999568',
    transaction_hash: '0xabc',
  },
  ...overrides,
})

const readOverview = () =>
  new QueryClient().fetchQuery(
    getResolverOverviewQueryOptions({ address: ADDRESS }),
  )

describe('getResolverOverviewQueryOptions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    bigname.resolver.mockReturnValue(overview(['juveniles.eth']))
    bigname.resolverLinks.mockReturnValue(page([]))
    bigname.resolverRoles.mockReturnValue(page([]))
    bigname.events.mockReturnValue(page([], { total: 3 }))
  })

  it('reads the overview, links, roles and events of the resolver on the app chain', async () => {
    bigname.resolverLinks.mockReturnValue(
      page([link('a.eth', '1'), link('b.eth', '1'), link('solo.eth', '2')]),
    )
    bigname.resolverRoles.mockReturnValue(page([role()]))

    const result = await readOverview()

    expect(bigname.resolver).toHaveBeenCalledWith(
      11155111,
      RESOLVER,
      { page_size: 1, include: ['total_count'] },
      { signal: expect.any(AbortSignal) },
    )
    expect(bigname.events).toHaveBeenCalledWith(
      expect.objectContaining({ resolver: `11155111:${RESOLVER}` }),
      { signal: expect.any(AbortSignal) },
    )
    expect(result).toMatchObject({
      address: RESOLVER,
      nodeCount: 1,
      nodeCountIsLowerBound: false,
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

  it('takes a grant’s scope from bigname’s EAC resource, and leaves it unknown when bigname does not say', async () => {
    bigname.resolverRoles.mockReturnValue(
      page([
        role({ eac_resource: '42' }),
        role({ eac_resource: undefined, powers: ['admin_set_addr'] }),
      ]),
    )

    const result = await readOverview()

    expect(result?.roles.map(({ resource }) => resource)).toEqual(['42', null])
  })

  it('keeps the weakest coverage any page stated, and never reports an unsupported count', async () => {
    bigname.resolverLinks.mockReturnValue(
      page([], { total: null, completeness: 'unsupported' }),
    )
    bigname.resolverRoles
      .mockReturnValueOnce(
        page([role()], { next: 'more', completeness: 'partial' }),
      )
      .mockReturnValueOnce(page([role({ address: '0x1' })]))

    const result = await readOverview()

    expect(result).toMatchObject({
      linkCount: null,
      linksStatus: 'unsupported',
      rolesStatus: 'partial',
      roleHolderCount: 2,
    })
    expect(bigname.resolverRoles).toHaveBeenLastCalledWith(
      11155111,
      RESOLVER,
      expect.objectContaining({ cursor: 'more' }),
      { signal: expect.any(AbortSignal) },
    )
  })

  it('counts the first page as a lower bound when bigname gives no total', async () => {
    bigname.resolver.mockReturnValue(
      overview(['a.eth', 'b.eth'], { next: 'more' }),
    )

    expect(await readOverview()).toMatchObject({
      nodeCount: 2,
      nodeCountIsLowerBound: true,
    })
  })

  it('answers null for a resolver bigname does not know', async () => {
    bigname.resolver.mockReturnValue(
      errAsync(new BignameError({ code: 'not_found', message: 'gone' })),
    )
    expect(await readOverview()).toBeNull()
  })

  it('renders without a node count when bigname cannot serve the bound names', async () => {
    bigname.resolver.mockReturnValue(
      errAsync(
        new BignameError({ code: 'request_timeout', message: 'too slow' }),
      ),
    )
    expect(await readOverview()).toMatchObject({
      nodeCount: null,
      nodeCountIsLowerBound: false,
      linkCount: 0,
    })
  })

  it('skips events with no transaction', async () => {
    const event = (id: string, transaction_hash: string | null) => ({
      id,
      type: 'resolver',
      block_number: 1,
      timestamp: '1790999568',
      transaction_hash,
      data: null,
    })
    bigname.events.mockReturnValue(
      page([event('derived', null), event('emitted', '0xabc')]),
    )
    const { events } = (await readOverview()) ?? {}
    expect(events?.map(({ id }) => id)).toEqual(['emitted'])
  })

  it('renders without recent events when bigname cannot serve them', async () => {
    bigname.events.mockReturnValue(
      errAsync(new BignameError({ code: 'internal_error', message: 'boom' })),
    )
    expect(await readOverview()).toMatchObject({ events: null, nodeCount: 1 })
  })

  it('fails when another read fails', async () => {
    bigname.resolverRoles.mockReturnValue(
      errAsync(new BignameError({ code: 'overloaded', message: 'busy' })),
    )
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
    bigname.resolver.mockReturnValueOnce(overview(['a.eth'], { next: 'more' }))

    const { pages } = await readNodes()

    expect(pages).toHaveLength(1)
    expect(pages[0]?.nodes.map(({ name }) => name)).toEqual(['a.eth'])
    expect(pages[0]?.nextCursor).toBe('more')
    expect(bigname.resolver).toHaveBeenCalledWith(
      11155111,
      RESOLVER,
      { page_size: 100, include: ['total_count'] },
      { signal: expect.any(AbortSignal) },
    )
  })

  it('counts the bound names on the first page only', async () => {
    bigname.resolver
      .mockReturnValueOnce(overview(['a.eth'], { next: 'more' }))
      .mockReturnValueOnce(overview(['b.eth']))

    await new QueryClient().fetchInfiniteQuery({
      ...getResolverNodesQueryOptions({ address: ADDRESS }),
      pages: 2,
    })

    expect(bigname.resolver).toHaveBeenLastCalledWith(
      11155111,
      RESOLVER,
      { page_size: 100, cursor: 'more' },
      { signal: expect.any(AbortSignal) },
    )
  })

  it('lists no nodes for a resolver bigname does not know', async () => {
    bigname.resolver.mockReturnValue(
      errAsync(new BignameError({ code: 'not_found', message: 'gone' })),
    )

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
})
