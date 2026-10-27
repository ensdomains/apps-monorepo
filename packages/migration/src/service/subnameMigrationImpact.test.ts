import {
  createBignameClient,
  type Envelope,
  type Meta,
  type NameRecord,
  type Page,
  type Subname,
} from '@ens-apps/indexer/bigname'
import { extendChainWithEns } from '@ensdomains/ensjs/chain'
import { namehash, type PublicClient, zeroAddress } from 'viem'
import { sepolia } from 'viem/chains'
import { describe, expect, it, vi } from 'vitest'
import { OTHER, OWNER } from './_fixtures'
import { readSubnameMigrationImpact } from './subnameMigrationImpact'

const NOW = 1_800_000_000
const BLOCK_NUMBER = 123n
const chain = extendChainWithEns(sepolia)
const freshMeta = {
  completeness: 'full',
  as_of: {
    [chain.id]: {
      block_number: Number(BLOCK_NUMBER),
      block_hash: `0x${'ab'.repeat(32)}`,
      timestamp: String(NOW),
    },
  },
} satisfies Meta

const envelope = <T>(data: T, meta: Meta = freshMeta): Envelope<T> => ({
  data,
  meta,
})

const page = (
  rows: readonly Subname[],
  overrides: Partial<Page> = {},
  meta: Meta = freshMeta,
) =>
  ({
    ...envelope(rows, meta),
    page: {
      cursor: null,
      next_cursor: null,
      page_size: 200,
      has_more: false,
      total_count: rows.length,
      ...overrides,
    },
  }) satisfies Envelope<readonly Subname[]>

const subname = (name: string, overrides: Partial<Subname> = {}): Subname => ({
  name,
  display_name: name,
  namespace: 'ens',
  namehash: namehash(name),
  authority: 'ens_v1',
  status: 'active',
  owner: OWNER,
  ens_v1: { wrapper_state: 'unwrapped' },
  subname_count: 0,
  ...overrides,
})

const root = (
  name = 'parent.eth',
  overrides: Partial<NameRecord> = {},
): NameRecord => ({
  ...subname(name),
  read_status: 'ok',
  ...overrides,
})

const wrapped = (name: string, fuses = 65_536): Subname =>
  subname(name, {
    ens_v1: {
      wrapper_state: 'wrapped',
      wrapper_expires_at: String(NOW + 3600),
      wrapper_fuses: {
        fuses,
        cannot_unwrap: false,
        cannot_burn_fuses: false,
        cannot_transfer: (fuses & 4) !== 0,
        cannot_set_resolver: false,
        cannot_set_ttl: false,
        cannot_create_subdomain: false,
        cannot_approve: false,
        parent_cannot_control: (fuses & 65_536) !== 0,
        is_dot_eth: false,
        can_extend_expiry: false,
      },
    },
  })

/** Keep the actual Bigname client and pagination; replace only HTTP and RPC. */
const fixture = (
  children: Readonly<Record<string, readonly Subname[]>> = { 'parent.eth': [] },
) => {
  const roots = new Map([['parent.eth', envelope(root())]])
  const pages = new Map(
    Object.entries(children).map(([name, rows]) => [
      name,
      [page(rows)] as readonly Envelope<readonly Subname[]>[],
    ]),
  )
  const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
    const url = new URL(String(input))
    const [name = '', resource] = decodeURIComponent(url.pathname)
      .replace('/v1/names/', '')
      .split('/')
    const response =
      resource === 'subnames'
        ? pages.get(name)?.[Number(url.searchParams.get('cursor') ?? 0)]
        : roots.get(name)
    if (!response) throw new Error(`Unexpected indexer request: ${url}`)
    return Response.json(response)
  })
  const indexer = createBignameClient('https://bigname.example', { fetch })
  const readContract = vi
    .fn()
    .mockRejectedValue(new Error('Unexpected RPC read'))
  const publicClient = {
    chain,
    getBlock: vi
      .fn()
      .mockResolvedValue({ number: BLOCK_NUMBER, timestamp: BigInt(NOW) }),
    readContract,
  } as unknown as PublicClient
  const read = (
    options: Partial<
      Pick<
        Parameters<typeof readSubnameMigrationImpact>[0],
        | 'migratingNames'
        | 'copiedNames'
        | 'renewingNames'
        | 'signal'
        | 'shouldSkipEmptySubtrees'
      >
    > = {},
  ) =>
    readSubnameMigrationImpact({
      indexer,
      publicClient,
      migratingNames: ['parent.eth'],
      ...options,
    })
  return { roots, pages, fetch, readContract, publicClient, read }
}

describe('readSubnameMigrationImpact', () => {
  it('can prove an empty subtree from a fresh root count without fetching its children', async () => {
    const { read, fetch } = fixture()
    const options = {
      migratingNames: ['parent.eth'],
      shouldSkipEmptySubtrees: true,
    }

    expect(await read(options)).toMatchObject({ affectedCount: 0, parents: [] })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('keeps the independent child read for callers that do not opt in', async () => {
    const { read, fetch } = fixture()

    await read()

    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it.each([undefined, 1])(
    'retains the child walk for count %j and still detects dependent names',
    async (subname_count) => {
      const { read, roots, fetch } = fixture({
        'parent.eth': [subname('child.parent.eth')],
      })
      roots.set('parent.eth', envelope(root('parent.eth', { subname_count })))

      expect(await read({ shouldSkipEmptySubtrees: true })).toMatchObject({
        affectedCount: 1,
      })
      expect(fetch).toHaveBeenCalledTimes(2)
    },
  )

  it.each([
    { ...freshMeta, completeness: 'partial' as const },
    {
      ...freshMeta,
      as_of: {
        [chain.id]: {
          ...freshMeta.as_of[chain.id],
          timestamp: String(NOW - 301),
        },
      },
    },
  ])(
    'does not let a zero count bypass failed root verification: %j',
    async (meta) => {
      const { read, roots, fetch } = fixture()
      roots.set('parent.eth', envelope(root(), meta))

      await expect(
        read({ shouldSkipEmptySubtrees: true }),
      ).rejects.toMatchObject({ _tag: 'SubnameMigrationImpactError' })
      expect(fetch).toHaveBeenCalledTimes(1)
    },
  )

  it('does not skip an explicitly selected descendant hidden by a zero parent count', async () => {
    const { read, fetch } = fixture({
      'parent.eth': [subname('child.parent.eth')],
    })

    await read({
      shouldSkipEmptySubtrees: true,
      migratingNames: ['parent.eth', 'child.parent.eth'],
    })

    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('still requires ownership RPC evidence before trusting a zero count', async () => {
    const { read, roots, readContract } = fixture()
    roots.set('parent.eth', envelope(root('parent.eth', { owner: undefined })))

    await expect(read({ shouldSkipEmptySubtrees: true })).rejects.toThrow(
      'Unexpected RPC read',
    )
    expect(readContract).toHaveBeenCalledTimes(1)
  })

  it('returns zero only after a complete, fresh empty subtree read', async () => {
    const { read } = fixture()
    expect(await read()).toMatchObject({ affectedCount: 0, parents: [] })
  })

  it('counts same-wallet and third-party descendants left out of the copy plan', async () => {
    const { read } = fixture({
      'parent.eth': [
        subname('owned.parent.eth'),
        subname('other.parent.eth', { owner: OTHER }),
      ],
    })
    expect(await read()).toMatchObject({
      affectedCount: 2,
      parents: [{ name: 'parent.eth', affectedCount: 2 }],
    })
  })

  it('drops an unknown-label leaf instead of blocking its parent', async () => {
    const unknown = `[${'ab'.repeat(32)}].parent.eth`
    const { read } = fixture({
      'parent.eth': [subname(unknown), subname('lost.parent.eth')],
    })
    expect(await read()).toMatchObject({
      affectedCount: 1,
      parents: [{ name: 'parent.eth', affectedCount: 1 }],
      unrecoverable: [unknown],
    })
  })

  it('still blocks on an unknown-label subname that has its own subnames', async () => {
    const unknown = `[${'ab'.repeat(32)}].parent.eth`
    const { read } = fixture({
      'parent.eth': [subname(unknown, { subname_count: 1 })],
      [unknown]: [subname(`child.${unknown}`)],
    })
    expect(await read()).toMatchObject({ affectedCount: 2, unrecoverable: [] })
  })

  it('preserves only selected copies through a preserved ancestor path', async () => {
    const { read } = fixture({
      'parent.eth': [subname('copied.parent.eth', { subname_count: 2 })],
      'copied.parent.eth': [
        subname('kept.copied.parent.eth'),
        subname('lost.copied.parent.eth'),
      ],
    })
    expect(
      await read({
        copiedNames: ['copied.parent.eth', 'kept.copied.parent.eth'],
      }),
    ).toMatchObject({
      affectedCount: 1,
      parents: [{ name: 'parent.eth', affectedCount: 1 }],
    })
  })

  it('cannot preserve a selected copy below an ancestor omitted from the plan', async () => {
    const { read } = fixture({
      'parent.eth': [subname('lost.parent.eth', { subname_count: 1 })],
      'lost.parent.eth': [subname('copy.lost.parent.eth')],
    })
    expect(await read({ copiedNames: ['copy.lost.parent.eth'] })).toMatchObject(
      { affectedCount: 2 },
    )
  })

  it('preserves a fully selected copy tree', async () => {
    const { read } = fixture({
      'parent.eth': [subname('child.parent.eth', { subname_count: 1 })],
      'child.parent.eth': [subname('leaf.child.parent.eth')],
    })
    expect(
      await read({
        copiedNames: ['child.parent.eth', 'leaf.child.parent.eth'],
      }),
    ).toMatchObject({ affectedCount: 0, parents: [] })
  })

  it('preserves independent wrapped branches and their unselected descendants', async () => {
    const { read } = fixture({
      'parent.eth': [
        {
          ...wrapped('independent.parent.eth'),
          owner: OTHER,
          subname_count: 1,
        },
        subname('dependent.parent.eth'),
      ],
    })
    expect(await read()).toMatchObject({ affectedCount: 1 })
  })

  it('does not treat an unrelated burned fuse as emancipation', async () => {
    const { read } = fixture({
      'parent.eth': [wrapped('dependent.parent.eth', 4)],
    })
    expect(await read()).toMatchObject({ affectedCount: 1 })
  })

  it('excludes expired emancipated subtrees', async () => {
    const expired = wrapped('expired.parent.eth')
    const { read } = fixture({
      'parent.eth': [
        {
          ...expired,
          ens_v1: { ...expired.ens_v1, wrapper_expires_at: String(NOW) },
          subname_count: 1,
        },
      ],
    })
    expect(await read()).toMatchObject({ affectedCount: 0 })
  })

  it('assigns descendants to their nearest selected migration root without double counting', async () => {
    const { read } = fixture({
      'parent.eth': [
        { ...wrapped('nested.parent.eth'), subname_count: 1 },
        subname('sibling.parent.eth'),
      ],
      'nested.parent.eth': [subname('leaf.nested.parent.eth')],
    })
    expect(
      await read({ migratingNames: ['parent.eth', 'nested.parent.eth'] }),
    ).toMatchObject({
      affectedCount: 2,
      parents: [
        { name: 'nested.parent.eth', affectedCount: 1 },
        { name: 'parent.eth', affectedCount: 1 },
      ],
    })
  })

  it('finds a selected migration root below an otherwise preserved independent branch', async () => {
    const { read } = fixture({
      'parent.eth': [
        { ...wrapped('independent.parent.eth'), subname_count: 1 },
      ],
      'independent.parent.eth': [
        { ...wrapped('nested.independent.parent.eth'), subname_count: 1 },
      ],
      'nested.independent.parent.eth': [
        subname('leaf.nested.independent.parent.eth'),
      ],
    })
    expect(
      await read({
        migratingNames: ['parent.eth', 'nested.independent.parent.eth'],
      }),
    ).toMatchObject({
      affectedCount: 1,
      parents: [{ name: 'nested.independent.parent.eth', affectedCount: 1 }],
    })
  })

  it('continues checking selected descendants when an ancestor already migrated', async () => {
    const { read, roots } = fixture({
      'nested.parent.eth': [subname('leaf.nested.parent.eth')],
    })
    roots.set(
      'parent.eth',
      envelope(root('parent.eth', { authority: 'ens_v2' })),
    )
    roots.set('nested.parent.eth', envelope(root('nested.parent.eth')))
    expect(
      await read({ migratingNames: ['parent.eth', 'nested.parent.eth'] }),
    ).toMatchObject({
      affectedCount: 1,
      parents: [{ name: 'nested.parent.eth', affectedCount: 1 }],
    })
  })

  it('reads every page before reporting a count', async () => {
    const { read, pages } = fixture()
    pages.set('parent.eth', [
      page([subname('a.parent.eth')], {
        total_count: 2,
        has_more: true,
        next_cursor: '1',
      }),
      page([subname('b.parent.eth')], { total_count: 2, cursor: '1' }),
    ])
    expect(await read()).toMatchObject({ affectedCount: 2 })
  })

  it('rejects duplicate identities across pages instead of returning an undercount', async () => {
    const { read, pages } = fixture()
    pages.set('parent.eth', [
      page([subname('a.parent.eth')], {
        total_count: 2,
        has_more: true,
        next_cursor: '1',
      }),
      page([subname('a.parent.eth')], { total_count: 2, cursor: '1' }),
    ])
    await expect(read()).rejects.toThrow('the subname list changed')
  })

  it('rejects a repeated subtree identity under different branches', async () => {
    const repeated = subname('leaf.a.parent.eth')
    const { read } = fixture({
      'parent.eth': [
        subname('a.parent.eth', { subname_count: 1 }),
        subname('b.parent.eth', { subname_count: 1 }),
      ],
      'a.parent.eth': [repeated],
      'b.parent.eth': [{ ...repeated, name: 'leaf.b.parent.eth' }],
    })
    await expect(read()).rejects.toThrow('a repeated subtree was returned')
  })

  it.each([null, undefined, 1])(
    'rejects an empty page with an unproven total of %s',
    async (total_count) => {
      const { read, pages } = fixture()
      const empty = page([])
      pages.set('parent.eth', [
        {
          ...empty,
          page:
            total_count === undefined
              ? undefined
              : { ...empty.page, total_count },
        },
      ])
      await expect(read()).rejects.toThrow('the subname list changed')
    },
  )

  it('rejects totals that change between pages', async () => {
    const { read, pages } = fixture()
    pages.set('parent.eth', [
      page([subname('a.parent.eth')], {
        total_count: 2,
        has_more: true,
        next_cursor: '1',
      }),
      page([subname('b.parent.eth')], { total_count: 3, cursor: '1' }),
    ])
    await expect(read()).rejects.toThrow('the subname list changed')
  })

  it.each(['root', 'first page', 'later page'])(
    'rejects stale metadata on the %s',
    async (location) => {
      const { read, roots, pages } = fixture()
      const staleMeta: Meta = {
        ...freshMeta,
        as_of: {
          [chain.id]: {
            ...freshMeta.as_of[chain.id],
            timestamp: String(NOW - 301),
          },
        },
      }
      if (location === 'root')
        roots.set('parent.eth', envelope(root(), staleMeta))
      else if (location === 'first page')
        pages.set('parent.eth', [page([], {}, staleMeta)])
      else
        pages.set('parent.eth', [
          page([subname('a.parent.eth')], {
            total_count: 1,
            has_more: true,
            next_cursor: '1',
          }),
          page([], { total_count: 1, cursor: '1' }, staleMeta),
        ])
      await expect(read()).rejects.toThrow(
        'the indexer data is incomplete or stale',
      )
    },
  )

  it.each<Meta>([
    { ...freshMeta, completeness: 'partial' },
    { ...freshMeta, completeness: 'unsupported' },
    { completeness: 'full', as_of: {} },
  ])('rejects incomplete metadata: %j', async (meta) => {
    const { read, pages } = fixture()
    pages.set('parent.eth', [page([], {}, meta)])
    await expect(read()).rejects.toThrow(
      'the indexer data is incomplete or stale',
    )
  })

  it('rejects a failed root read instead of reporting zero', async () => {
    const { read, roots } = fixture()
    roots.set(
      'parent.eth',
      envelope(root('parent.eth', { read_status: 'failed' })),
    )
    await expect(read()).rejects.toThrow('unable to read parent.eth')
  })

  it('propagates an indexer transport failure', async () => {
    const { read, fetch } = fixture()
    fetch.mockRejectedValue(new Error('indexer offline'))
    await expect(read()).rejects.toThrow('indexer offline')
  })

  it('rejects a dependent row with an unknown child count', async () => {
    const { read } = fixture({
      'parent.eth': [subname('child.parent.eth', { subname_count: undefined })],
    })
    await expect(read()).rejects.toThrow('missing child count')
  })

  it('uses snapshot-pinned RPC facts when the indexer omits wrapper facts', async () => {
    const { read, readContract } = fixture({
      'parent.eth': [
        subname('child.parent.eth', { owner: undefined, ens_v1: undefined }),
      ],
    })
    readContract
      .mockResolvedValueOnce(chain.contracts.ensNameWrapper.address)
      .mockResolvedValueOnce([OTHER, 65_536, BigInt(NOW + 3600)])
    expect(await read()).toMatchObject({ affectedCount: 0 })
    expect(readContract).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        functionName: 'owner',
        args: [namehash('child.parent.eth')],
        blockNumber: BLOCK_NUMBER,
      }),
    )
    expect(readContract).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        functionName: 'getData',
        args: [BigInt(namehash('child.parent.eth'))],
        blockNumber: BLOCK_NUMBER,
      }),
    )
  })

  it('rejects unknown registry ownership instead of treating it as a dead subtree', async () => {
    const { read, readContract } = fixture({
      'parent.eth': [
        subname('child.parent.eth', { owner: undefined, ens_v1: undefined }),
      ],
    })
    readContract.mockResolvedValueOnce(zeroAddress)
    await expect(read()).rejects.toThrow('ownership is unknown')
  })

  it('rejects an unknown wrapper holder instead of returning zero', async () => {
    const { read, readContract } = fixture({
      'parent.eth': [
        subname('child.parent.eth', { owner: undefined, ens_v1: undefined }),
      ],
    })
    readContract
      .mockResolvedValueOnce(chain.contracts.ensNameWrapper.address)
      .mockResolvedValueOnce([zeroAddress, 65_536, BigInt(NOW + 3600)])
    await expect(read()).rejects.toThrow('the wrapper holder is unknown')
  })

  it('propagates RPC failures for unknown rows', async () => {
    const { read, readContract } = fixture({
      'parent.eth': [
        subname('child.parent.eth', { owner: undefined, ens_v1: undefined }),
      ],
    })
    readContract.mockRejectedValueOnce(new Error('RPC unavailable'))
    await expect(read()).rejects.toThrow('RPC unavailable')
  })

  it('rejects an aborted check', async () => {
    const { read } = fixture()
    await expect(
      read({ signal: AbortSignal.abort(new Error('cancelled')) }),
    ).rejects.toThrow('cancelled')
  })

  it('keeps the fingerprint stable across input order but invalidates it for a changed affected identity', async () => {
    const { read, pages } = fixture({
      'parent.eth': [subname('a.parent.eth'), subname('b.parent.eth')],
    })
    const first = await read({
      copiedNames: ['unused.parent.eth', 'other.parent.eth'],
    })
    pages.set('parent.eth', [
      page([subname('b.parent.eth'), subname('a.parent.eth')]),
    ])
    expect(
      (await read({ copiedNames: ['other.parent.eth', 'unused.parent.eth'] }))
        .fingerprint,
    ).toBe(first.fingerprint)
    pages.set('parent.eth', [
      page([subname('b.parent.eth'), subname('c.parent.eth')]),
    ])
    const changed = await read({
      copiedNames: ['other.parent.eth', 'unused.parent.eth'],
    })
    expect(changed.affectedCount).toBe(2)
    expect(changed.fingerprint).not.toBe(first.fingerprint)
  })
})
