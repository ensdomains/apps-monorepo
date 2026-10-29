import {
  createBignameClient,
  type Meta,
  type Subname,
} from '@ens-apps/indexer/bigname'
import {
  type Address,
  type Hex,
  labelhash,
  maxUint64,
  namehash,
  type PublicClient,
  zeroAddress,
} from 'viem'
import { describe, expect, it, vi } from 'vitest'
import { envConfig } from '@/config'
import { V1_CONTRACTS } from '../contracts/addresses'
import { DEFAULT_RESOLVER, makeDomain, OTHER, OWNER } from './_fixtures'
import { classifyNames } from './classifyNames'
import {
  applySubnameRecreation,
  assertSubnameRecreationUnchanged,
  discoverSubnameRecreation,
} from './subnameRecreation'

vi.mock('@/lib/wagmi', async () => ({
  sepoliaWithEns: (await import('@/config')).envConfig.chain,
  publicClient: {},
}))

const ROOT = 'alice.eth'
const CHILD = 'blog.alice.eth'
const BLOCK_HASH = `0x${'11'.repeat(32)}` as Hex
const root = makeDomain({
  name: ROOT,
  id: namehash(ROOT),
  labelhash: labelhash('alice'),
})
const row: Subname = {
  name: CHILD,
  display_name: CHILD,
  namespace: 'ens',
  namehash: namehash(CHILD),
  status: 'active',
  owner: OWNER, // Deliberately stale: RPC, not this indexed owner, is authoritative.
  subname_count: 0,
}
const UNKNOWN = `[${'ab'.repeat(32)}].${ROOT}`
const unknownRow: Subname = {
  ...row,
  name: UNKNOWN,
  display_name: UNKNOWN,
  namehash: namehash(UNKNOWN),
}
const meta: Meta = {
  completeness: 'full',
  as_of: {
    [envConfig.chain.id]: {
      block_number: 100,
      block_hash: BLOCK_HASH,
      timestamp: '1000',
    },
  },
}

const fixture = (
  options: {
    count?: number | null
    rows?: readonly Subname[]
    total?: number
    metadata?: Meta
  } = {},
) => {
  const state = {
    owner: OTHER as Address,
    resolver: DEFAULT_RESOLVER as Address,
    wrapped: [OTHER, 0, maxUint64] as [Address, number, bigint],
    head: 100n,
    parentEvents: [] as { args: { label: Hex } }[],
    descendantEvents: [] as { args: { label: Hex } }[],
  }
  const indexer = createBignameClient('https://indexer.invalid', {
    fetch: async (input) => {
      const collection = new URL(String(input)).pathname.endsWith('/subnames')
      return new Response(
        JSON.stringify({
          data: collection
            ? (options.rows ?? [row])
            : {
                name: ROOT,
                display_name: ROOT,
                namespace: 'ens',
                namehash: namehash(ROOT),
                read_status: 'ok',
                subname_count: options.count === undefined ? 1 : options.count,
              },
          meta: options.metadata ?? meta,
          ...(collection
            ? {
                page: {
                  cursor: null,
                  next_cursor: null,
                  page_size: 200,
                  total_count: options.total ?? options.count ?? 1,
                  has_more: false,
                },
              }
            : {}),
        }),
      )
    },
  })
  const readContract = vi.fn(
    async ({
      functionName,
      args,
      blockNumber,
    }: {
      functionName: string
      args: readonly unknown[]
      blockNumber: bigint
    }) => {
      if (
        blockNumber !== state.head ||
        (args[0] !== namehash(CHILD) && args[0] !== BigInt(namehash(CHILD)))
      )
        throw new Error('Unexpected source identity or checkpoint')
      switch (functionName) {
        case 'owner':
          return state.owner
        case 'resolver':
          return state.resolver
        case 'getData':
          return state.wrapped
        default:
          throw new Error(`Unexpected read: ${functionName}`)
      }
    },
  )
  const client = {
    chain: envConfig.chain,
    getBlock: async ({ blockNumber = state.head } = {}) => ({
      number: blockNumber,
      timestamp: 1000n + (blockNumber - 100n),
      hash: BLOCK_HASH,
    }),
    getLogs: async ({ args }: { args: { node: Hex } }) =>
      args.node === namehash(ROOT)
        ? state.parentEvents
        : state.descendantEvents,
    readContract,
  } as unknown as PublicClient
  const discover = () =>
    discoverSubnameRecreation({
      domains: [root],
      owner: OWNER,
      publicClient: client,
      indexer,
    })
  return { state, client, discover }
}

describe('direct subname source checks', () => {
  it.each(['partial', 'stale'] as const)(
    'does not make a childless name a recreation root when its inventory is %s',
    async (kind) => {
      const context = fixture({
        count: 0,
        rows: [],
        ...(kind === 'partial'
          ? { metadata: { ...meta, completeness: 'partial' } }
          : {}),
      })
      if (kind === 'stale') context.state.head = 1000n
      const discovered = await context.discover()
      expect(discovered.snapshot.roots).toEqual([])
      expect(discovered.domains.map(({ name }) => name)).toEqual([ROOT])
      expect(context.client.readContract).not.toHaveBeenCalled()
    },
  )
  it.each([false, true])(
    'preserves canonical ownership and the exact resolver (wrapped: %s)',
    async (wrapped) => {
      const context = fixture()
      if (wrapped) context.state.owner = V1_CONTRACTS.NameWrapper
      const found = await context.discover()
      const classified = classifyNames(
        [...found.domains],
        OWNER,
        envConfig.chain.id,
      ).classified
      const imported = applySubnameRecreation({
        ...found,
        classified,
        owner: OWNER,
      })

      expect(
        imported.find(({ domain }) => domain.name === CHILD),
      ).toMatchObject({
        action: 'copy',
        tokenHolder: OTHER,
        sourceExpiry: maxUint64,
        resolverStrategy: 'keep-v1',
        v1ResolverAddress: DEFAULT_RESOLVER,
        recreationRoot: ROOT,
      })
      await expect(
        assertSubnameRecreationUnchanged({
          publicClient: context.client,
          ...found,
        }),
      ).resolves.toBeUndefined()
    },
  )

  it.each([
    { case: 'missing count', options: { count: null }, reason: /incomplete/ },
    {
      case: 'missing child',
      options: { count: 2 },
      reason: /missing or duplicated/,
    },
    {
      case: 'duplicate child',
      options: { count: 2, rows: [row, row] },
      reason: /missing or duplicated/,
    },
    { case: 'changing count', options: { total: 2 }, reason: /count changed/ },
    {
      case: 'partial inventory',
      options: { metadata: { ...meta, completeness: 'partial' as const } },
      reason: /complete indexed inventory/,
    },
    {
      case: 'missing checkpoint',
      options: { metadata: { completeness: 'full' as const } },
      reason: /canonical checkpoint/,
    },
    {
      case: 'dependent deeper child',
      options: { rows: [{ ...row, subname_count: 1 }] },
      reason: /deeper subnames/,
    },
  ])(
    'rejects $case instead of importing a partial tree',
    async ({ options, reason }) => {
      await expect(fixture(options).discover()).rejects.toThrow(reason)
    },
  )

  it.each([
    { case: 'beside a known child', rows: [row, unknownRow], roots: [ROOT] },
    { case: 'as the only child', rows: [unknownRow], roots: [ROOT] },
  ])(
    'keeps checking the parent but leaves an unknown-label child out of the import $case',
    async ({ rows, roots }) => {
      const discovered = await fixture({
        count: rows.length,
        rows,
      }).discover()
      expect(discovered.snapshot.roots).toEqual(roots)
      expect(discovered.domains.map(({ name }) => name)).not.toContain(UNKNOWN)
      expect(discovered.unrecoverable).toEqual([UNKNOWN])
    },
  )

  it('rejects an unknown-label child that gained a subname after indexing', async () => {
    const context = fixture({ count: 1, rows: [unknownRow] })
    context.state.descendantEvents = [{ args: { label: labelhash('new') } }]
    await expect(context.discover()).rejects.toThrow(/descendants changed/)
  })

  it('rejects an unknown-label row whose hash does not prove its node', async () => {
    await expect(
      fixture({
        count: 1,
        rows: [{ ...unknownRow, namehash: namehash(CHILD) }],
      }).discover(),
    ).rejects.toThrow(/exact, valid subname label/)
  })

  it('rejects an unindexed child created after the published checkpoint', async () => {
    const context = fixture()
    context.state.head = 101n
    context.state.parentEvents = [{ args: { label: labelhash('unindexed') } }]
    await expect(context.discover()).rejects.toThrow(
      /parent changed after indexing/,
    )
  })

  it.each(['owner', 'resolver'] as const)(
    'blocks signing when the child %s changed after review',
    async (field) => {
      const context = fixture()
      const found = await context.discover()
      context.state.head = 101n
      context.state[field] = OWNER

      await expect(
        assertSubnameRecreationUnchanged({
          publicClient: context.client,
          ...found,
        }),
      ).rejects.toThrow(/controller or resolver changed/)
    },
  )

  it.each(['owner', 'fuses', 'expiry'] as const)(
    'blocks signing when wrapped %s changed after review',
    async (field) => {
      const context = fixture()
      context.state.owner = V1_CONTRACTS.NameWrapper
      const found = await context.discover()
      context.state.head = 101n
      context.state.wrapped =
        field === 'owner'
          ? [OWNER, 0, maxUint64]
          : field === 'fuses'
            ? [OTHER, 1, maxUint64]
            : [OTHER, 0, maxUint64 - 1n]

      await expect(
        assertSubnameRecreationUnchanged({
          publicClient: context.client,
          ...found,
        }),
      ).rejects.toThrow(/wrapped owner or permissions changed/)
    },
  )

  it('binds recovery to the reviewed owner/resolver inventory', async () => {
    const found = await fixture().discover()
    const domains = found.domains.map((domain) =>
      domain.name === CHILD
        ? { ...domain, resolver: { address: zeroAddress } }
        : domain,
    )
    expect(() =>
      applySubnameRecreation({
        ...found,
        domains,
        owner: OWNER,
        classified: classifyNames(domains, OWNER, envConfig.chain.id)
          .classified,
      }),
    ).toThrow(/identity does not match/)
  })
})
