import {
  createBignameClient,
  type Meta,
  type Subname,
} from '@ens-apps/indexer/bigname'
import {
  registryOwnerSnippet,
  registryResolverSnippet,
} from '@ensdomains/ensjs-abi/registry'
import { nameWrapperGetDataSnippet } from '@ensdomains/ensjs-abi/v1/nameWrapper'
import {
  type Address,
  createPublicClient,
  custom,
  decodeFunctionData,
  encodeFunctionResult,
  type Hex,
  isHex,
  labelhash,
  maxUint64,
  multicall3Abi,
  namehash,
  type PublicClient,
  zeroAddress,
  zeroHash,
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

type SourceRead = {
  readonly functionName: string
  readonly args: readonly unknown[]
  readonly blockNumber: bigint
}
type SourceMulticall = {
  readonly contracts: readonly Omit<SourceRead, 'blockNumber'>[]
  readonly blockNumber: bigint
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
    async ({ functionName, args, blockNumber }: SourceRead) => {
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
    getLogs: vi.fn(
      async ({ args }: { args: { node: Hex | readonly Hex[] } }) =>
        (typeof args.node === 'string' ? [args.node] : args.node).includes(
          namehash(ROOT),
        )
          ? state.parentEvents
          : state.descendantEvents,
    ),
    readContract,
    multicall: async ({ contracts, blockNumber }: SourceMulticall) =>
      Promise.all(
        contracts.map((contract) => readContract({ ...contract, blockNumber })),
      ),
  } as unknown as PublicClient
  const discover = () =>
    discoverSubnameRecreation({
      domains: [root],
      owner: OWNER,
      publicClient: client,
      indexer,
    })
  return { state, client, indexer, discover }
}

describe('direct subname source checks', () => {
  const rpcCases = [
    { phase: 'discovery', failure: 'none' },
    { phase: 'validation', failure: 'none' },
    { phase: 'discovery', failure: 'revert' },
    { phase: 'validation', failure: 'revert' },
    { phase: 'validation', failure: 'rpc' },
    { phase: 'validation', failure: 'reorg' },
  ] as const
  it.each(rpcCases)(
    'multicalls 127 child sources during $phase and rejects $failure failures',
    async ({ phase, failure }) => {
      const checkpoint = 8_000_000n
      const state: {
        head: bigint
        failure: (typeof rpcCases)[number]['failure']
      } = {
        head: checkpoint,
        failure: phase === 'discovery' ? failure : 'none',
      }
      const rows = Array.from({ length: 127 }, (_, index) => {
        const name = `child${index}.${ROOT}`
        return { ...row, name, display_name: name, namehash: namehash(name) }
      })
      const context = fixture({
        count: rows.length,
        rows,
        metadata: {
          ...meta,
          as_of: {
            [envConfig.chain.id]: {
              block_number: Number(checkpoint),
              block_hash: BLOCK_HASH,
              timestamp: '1000',
            },
          },
        },
      })
      const abi = [
        ...registryOwnerSnippet,
        ...registryResolverSnippet,
        ...nameWrapperGetDataSnippet,
      ] as const
      const answer = (data: Hex): Hex => {
        const call = decodeFunctionData({ abi, data })
        switch (call.functionName) {
          case 'owner':
            return encodeFunctionResult({
              abi,
              functionName: 'owner',
              result: V1_CONTRACTS.NameWrapper,
            })
          case 'resolver':
            return encodeFunctionResult({
              abi,
              functionName: 'resolver',
              result: DEFAULT_RESOLVER,
            })
          case 'getData':
            return encodeFunctionResult({
              abi,
              functionName: 'getData',
              result: [OTHER, 0, maxUint64],
            })
        }
      }
      const aggregates: number[] = []
      const logNodes: unknown[] = []
      const answerAggregate = (data: Hex): Hex => {
        const aggregate = decodeFunctionData({ abi: multicall3Abi, data })
        if (aggregate.functionName !== 'aggregate3')
          throw new Error('Expected aggregate3')
        aggregates.push(aggregate.args[0].length)
        return encodeFunctionResult({
          abi: multicall3Abi,
          functionName: 'aggregate3',
          result: aggregate.args[0].map(
            (
              { callData },
              index,
            ): { readonly success: boolean; readonly returnData: Hex } =>
              state.failure === 'revert' && index === 0
                ? { success: false, returnData: '0x' }
                : { success: true, returnData: answer(callData) },
          ),
        })
      }
      const answerBlock = (tag: unknown) => {
        const number = tag === 'latest' ? state.head : BigInt(String(tag))
        return {
          number: `0x${number.toString(16)}`,
          timestamp: `0x${(1000n + number - checkpoint).toString(16)}`,
          hash:
            state.failure === 'reorg' &&
            tag !== 'latest' &&
            number === state.head
              ? zeroHash
              : BLOCK_HASH,
          transactions: [],
        }
      }
      const recordLogFilter = (filter: unknown): void => {
        if (
          typeof filter === 'object' &&
          filter !== null &&
          'topics' in filter &&
          Array.isArray(filter.topics)
        )
          logNodes.push(filter.topics[1])
      }
      const readCallData = (
        method: string,
        params: readonly unknown[] | undefined,
      ): Hex => {
        const call = params?.[0]
        if (
          method !== 'eth_call' ||
          typeof call !== 'object' ||
          call === null ||
          !('data' in call) ||
          !isHex(call.data)
        )
          throw new Error(`Unexpected RPC ${method}`)
        expect(params?.[1]).toBe(`0x${state.head.toString(16)}`)
        return call.data
      }
      const request = vi.fn(
        async ({
          method,
          params,
        }: {
          readonly method: string
          readonly params?: readonly unknown[]
        }) => {
          if (method === 'eth_getBlockByNumber') return answerBlock(params?.[0])
          if (method === 'eth_getLogs') {
            recordLogFilter(params?.[0])
            return []
          }
          const data = readCallData(method, params)
          if (state.failure === 'rpc') throw new Error('RPC unavailable')
          if (data.startsWith('0x82ad56cb')) return answerAggregate(data)
          return answer(data)
        },
      )
      const publicClient = createPublicClient({
        chain: envConfig.chain,
        transport: custom({ request }, { retryCount: 0 }),
      })
      const discovery = discoverSubnameRecreation({
        domains: [root],
        owner: OWNER,
        indexer: context.indexer,
        publicClient,
      })
      if (phase === 'discovery' && failure !== 'none') {
        await expect(discovery).rejects.toThrow()
        return
      }
      const found = await discovery
      expect(found.domains.map(({ name }) => name)).toEqual([
        ROOT,
        ...rows.map(({ name }) => name),
      ])
      if (phase === 'validation') {
        request.mockClear()
        aggregates.length = 0
        logNodes.length = 0
        state.head += 1n
        state.failure = failure
        const validation = assertSubnameRecreationUnchanged({
          ...found,
          publicClient,
        })
        if (failure !== 'none') {
          await expect(validation).rejects.toThrow()
          return
        }
        await validation
      }
      expect(
        request.mock.calls.filter(([call]) => call.method === 'eth_call'),
      ).toHaveLength(2)
      expect(logNodes.map((nodes) => [nodes].flat())).toEqual([
        [namehash(ROOT)],
        rows.map(({ namehash }) => namehash),
      ])
      expect(aggregates).toEqual([254, 127])
      expect(
        request.mock.calls.filter(([call]) => call.method === 'eth_getLogs'),
      ).toHaveLength(2)
    },
  )

  it('reads children together while preserving every source identity', async () => {
    const rows = Array.from({ length: 9 }, (_, index) => {
      const name = `child${index}.${ROOT}`
      return { ...row, name, display_name: name, namehash: namehash(name) }
    })
    const context = fixture({ count: rows.length, rows })
    let release = (): void => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const ownerReads = vi.fn(async () => {
      await gate
      return OTHER
    })
    const readContract = vi.fn(async ({ functionName }: SourceRead) =>
      functionName === 'owner' ? ownerReads() : DEFAULT_RESOLVER,
    )
    const discovery = discoverSubnameRecreation({
      domains: [root],
      owner: OWNER,
      indexer: context.indexer,
      publicClient: {
        ...context.client,
        readContract,
        multicall: async ({ contracts, blockNumber }: SourceMulticall) =>
          Promise.all(
            contracts.map((contract) =>
              readContract({ ...contract, blockNumber }),
            ),
          ),
      } as PublicClient,
    })
    try {
      await vi.waitFor(() =>
        expect(ownerReads).toHaveBeenCalledTimes(rows.length),
      )
    } finally {
      release()
    }
    const found = await discovery

    expect(found.domains.map(({ name }) => name)).toEqual([
      ROOT,
      ...rows.map(({ name }) => name),
    ])
    expect(context.client.getLogs).toHaveBeenCalledTimes(2)
    expect(context.client.getLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        args: { node: rows.map(({ namehash }) => namehash) },
        fromBlock: 100n,
        toBlock: 100n,
      }),
    )
    expect(readContract.mock.calls.map(([request]) => request)).toEqual(
      rows.flatMap((child) => [
        expect.objectContaining({
          functionName: 'owner',
          args: [child.namehash],
          blockNumber: 100n,
        }),
        expect.objectContaining({
          functionName: 'resolver',
          args: [child.namehash],
          blockNumber: 100n,
        }),
      ]),
    )
  })

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

  it('rejects an unindexed child created after the published checkpoint', async () => {
    const context = fixture()
    context.state.head = 101n
    context.state.parentEvents = [{ args: { label: labelhash('unindexed') } }]
    await expect(context.discover()).rejects.toThrow(
      /parent changed after indexing/,
    )
  })

  it('rejects descendants created below any child in the batched log check', async () => {
    const context = fixture()
    context.state.descendantEvents = [
      { args: { label: labelhash('new-leaf') } },
    ]
    await expect(context.discover()).rejects.toThrow(
      /descendants changed after indexing/,
    )
  })

  it.each(['parent', 'descendant'] as const)(
    'blocks signing after a new %s event in a batched log filter',
    async (kind) => {
      const context = fixture()
      const found = await context.discover()
      context.state.head = 101n
      const events = [{ args: { label: labelhash('new-child') } }]
      if (kind === 'parent') context.state.parentEvents = events
      else context.state.descendantEvents = events
      await expect(
        assertSubnameRecreationUnchanged({
          ...found,
          publicClient: context.client,
        }),
      ).rejects.toThrow(
        kind === 'parent'
          ? /child inventory changed after review/
          : /descendants changed after review/,
      )
    },
  )

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
