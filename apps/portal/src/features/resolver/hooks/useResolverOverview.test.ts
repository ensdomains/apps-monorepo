import type { QueryFunctionContext } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import {
  getResolverOverviewQueryOptions,
  powersToResolverRoleBitmap,
  pruneLinksAfterUnlink,
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
    const { queryFn, queryKey } = getResolverOverviewQueryOptions({
      address: RESOLVER,
    })
    return (queryFn as (context: unknown) => Promise<unknown>)({
      queryKey,
    } as unknown as QueryFunctionContext)
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
            timestamp: '2026-06-10T00:00:06Z',
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
            timestamp: '2026-06-10T00:00:06Z',
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
    )
    expect(overview).toMatchObject({
      nodeCount: 12,
      nodes: [
        {
          id: '0xaa',
          name: 'a.eth',
          owner: { id: HOLDER },
          resolver: { address: RESOLVER.toLowerCase() },
        },
      ],
      linkCount: 2,
      roleHolderCount: 1,
      roles: [
        { account: HOLDER, resource: '0', roleBitmap: '1' },
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

  it('answers null for a resolver bigname has no overview of', async () => {
    bigname.getResolver.mockResolvedValue(null)
    bigname.listResolverLinks.mockResolvedValue(page([], null))
    bigname.listResolverRoles.mockResolvedValue(page([], null))
    bigname.listEvents.mockResolvedValue(page([], 0))
    expect(await read()).toBeNull()
  })
})
