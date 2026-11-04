import {
  createBignameClient,
  type Meta,
  type Subname,
} from '@ens-apps/indexer/bigname'
import { unknownLabelhashOf } from '@ens-apps/migration'
import {
  registryOwnerSnippet,
  registryResolverSnippet,
} from '@ensdomains/ensjs-abi/registry'
import {
  nameWrapperGetDataSnippet,
  nameWrapperNamesSnippet,
} from '@ensdomains/ensjs-abi/v1/nameWrapper'
import {
  type Address,
  concat,
  createPublicClient,
  custom,
  decodeFunctionData,
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionResult,
  getAddress,
  type Hex,
  isHex,
  keccak256,
  labelhash,
  maxUint64,
  multicall3Abi,
  namehash,
  type PublicClient,
  TimeoutError,
  toHex,
  zeroAddress,
  zeroHash,
} from 'viem'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { envConfig } from '@/config'
import { V1_CONTRACTS } from '../contracts/addresses'
import { DEFAULT_RESOLVER, makeDomain, OTHER, OWNER } from './_fixtures'
import { classifyNames } from './classifyNames'
import { RpcSubnameInventoryError } from './readRpcSubnameInventory'
import * as impactReader from './readRpcSubnameMigrationImpact'
import { NEW_OWNER_ABI } from './rpcSubnameInventory'
import {
  applySubnameRecreation,
  assertSubnameRecreationUnchanged,
  assertSupportedSubnameMigration,
  discoverSubnameRecreation,
} from './subnameRecreation'
import { SubnameRecreationError } from './subnameRecreationError'

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
    rpcFault?: 'duplicate' | 'removed' | 'missing-checkpoint'
  } = {},
) => {
  const state = {
    owner: OTHER as Address,
    resolver: DEFAULT_RESOLVER as Address,
    wrapped: [OTHER, 0, maxUint64] as [Address, number, bigint],
    head: 100n,
    eventRegistry: V1_CONTRACTS.LegacyRegistry as Address,
    parentEvents: [] as { args: { label: Hex } }[],
    descendantEvents: [] as { args: { label: Hex } }[],
    descendantParent: CHILD,
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
        ![
          namehash(ROOT),
          ...(options.rows ?? [row]).map(({ namehash }) => namehash),
          ...state.parentEvents.map(({ args }) =>
            keccak256(concat([namehash(ROOT), args.label])),
          ),
          ...state.descendantEvents.map(({ args }) =>
            keccak256(concat([namehash(state.descendantParent), args.label])),
          ),
        ].some((node) => args[0] === node || args[0] === BigInt(node))
      )
        throw new Error('Unexpected source identity or checkpoint')
      switch (functionName) {
        case 'owner':
          return args[0] === namehash(ROOT) ? OWNER : state.owner
        case 'resolver':
          return state.resolver
        case 'getData':
          return state.wrapped
        case 'names':
          return '0x'
        default:
          throw new Error(`Unexpected read: ${functionName}`)
      }
    },
  )
  const sourceAbi = [
    ...registryOwnerSnippet,
    ...registryResolverSnippet,
    ...nameWrapperGetDataSnippet,
    ...nameWrapperNamesSnippet,
  ] as const
  const answerSource = async (data: Hex, blockNumber: bigint): Promise<Hex> => {
    const call = decodeFunctionData({ abi: sourceAbi, data })
    const result = await readContract({
      functionName: call.functionName,
      args: call.args,
      blockNumber,
    })
    return encodeFunctionResult({
      abi: sourceAbi,
      functionName: call.functionName,
      result,
    })
  }
  const answerCall = async (
    input: unknown,
    blockTag: unknown,
  ): Promise<Hex> => {
    const call = input as { readonly data: Hex }
    if (call.data === '0xb83f8663') return '0x'
    const blockNumber = BigInt(String(blockTag))
    if (!call.data.startsWith('0x82ad56cb'))
      return answerSource(call.data, blockNumber)
    const aggregate = decodeFunctionData({
      abi: multicall3Abi,
      data: call.data,
    })
    if (aggregate.functionName !== 'aggregate3')
      throw new Error('Expected aggregate3')
    const result = await Promise.all(
      aggregate.args[0].map(async ({ callData }) => ({
        success: true,
        returnData: await answerSource(callData, blockNumber),
      })),
    )
    return encodeFunctionResult({
      abi: multicall3Abi,
      functionName: 'aggregate3',
      result,
    })
  }
  const request = vi.fn(
    async ({
      method,
      params,
    }: {
      readonly method: string
      readonly params?: readonly unknown[]
    }) => {
      if (method === 'eth_chainId') return toHex(envConfig.chain.id)
      if (method === 'eth_getCode') return '0x6000'
      if (method === 'eth_call') return answerCall(params?.[0], params?.[1])
      if (method === 'eth_getBlockByNumber') {
        const number =
          params?.[0] === 'latest' ? state.head : BigInt(String(params?.[0]))
        return {
          number: toHex(number),
          timestamp: toHex(1000n + number - 100n),
          hash: options.rpcFault === 'missing-checkpoint' ? null : BLOCK_HASH,
        }
      }
      if (method !== 'eth_getLogs') throw new Error(`Unexpected RPC ${method}`)
      const filter = params?.[0] as {
        readonly address: Address | readonly Address[]
        readonly topics: readonly [string, readonly Hex[]]
        readonly fromBlock: Hex
        readonly toBlock: Hex
      }
      const entries = [
        ...(filter.topics[1].includes(namehash(ROOT))
          ? [
              ...(options.rows ?? [row]).map((child) => ({
                parent: namehash(ROOT),
                label:
                  unknownLabelhashOf(child.name) ??
                  labelhash(child.name.split('.')[0] ?? ''),
                blockNumber: 100n,
                address: V1_CONTRACTS.LegacyRegistry,
              })),
              ...state.parentEvents.map(({ args }) => ({
                parent: namehash(ROOT),
                label: args.label,
                blockNumber: state.head,
                address: state.eventRegistry,
              })),
            ]
          : []),
        ...(filter.topics[1].includes(namehash(state.descendantParent))
          ? state.descendantEvents.map(({ args }) => ({
              parent: namehash(state.descendantParent),
              label: args.label,
              blockNumber: state.head,
              address: state.eventRegistry,
            }))
          : []),
      ]
      const logs = entries
        .filter(
          ({ address, blockNumber }) =>
            [filter.address].flat().includes(address) &&
            blockNumber >= BigInt(filter.fromBlock) &&
            blockNumber <= BigInt(filter.toBlock),
        )
        .map(({ parent, label, address, blockNumber }, index) => ({
          address,
          blockNumber: toHex(blockNumber),
          blockHash: BLOCK_HASH,
          transactionHash: BLOCK_HASH,
          logIndex: toHex(index),
          removed: options.rpcFault === 'removed',
          topics: encodeEventTopics({
            abi: NEW_OWNER_ABI,
            eventName: 'NewOwner',
            args: { node: parent, label },
          }),
          data: encodeAbiParameters([{ type: 'address' }], [OTHER]),
        }))
      return options.rpcFault === 'duplicate' ? [...logs, ...logs] : logs
    },
  )
  const client = createPublicClient({
    chain: {
      ...envConfig.chain,
      contracts: {
        ...envConfig.chain.contracts,
        multicall3: {
          ...envConfig.chain.contracts.multicall3,
          blockCreated: 0,
        },
      },
    },
    transport: custom({ request }, { retryCount: 0 }),
  })
  const discover = () =>
    discoverSubnameRecreation({
      domains: [root],
      owner: OWNER,
      publicClient: client,
      indexer,
    })
  return { state, client, indexer, discover, request, readContract }
}

describe('preparation and execution subname safety retries', () => {
  const safeImpact = {
    parents: [],
    affectedCount: 0,
    unrecoverable: [],
    fingerprint: 'safe',
    checkedAt: 1000,
  }
  const timeout = new TimeoutError({ url: 'https://rpc.invalid', body: {} })
  const run = () => {
    vi.useFakeTimers()
    const read = vi.spyOn(impactReader, 'readRpcSubnameMigrationImpact')
    const controller = new AbortController()
    const check = () =>
      assertSupportedSubnameMigration({
        publicClient: fixture().client,
        classified: classifyNames([root], OWNER, envConfig.chain.id).classified,
        signal: controller.signal,
      })
    return { read, controller, check }
  }

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('recovers from a transient read only after the retry delay', async () => {
    const { read, check } = run()
    read.mockRejectedValueOnce(timeout).mockResolvedValueOnce(safeImpact)
    const pending = check().catch((cause: unknown) => cause)

    await vi.advanceTimersByTimeAsync(999)
    expect(read).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)

    expect(await pending).toEqual(safeImpact)
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('stops a persistent outage after three total safety checks', async () => {
    const { read, check } = run()
    read.mockRejectedValue(timeout)
    const pending = check().catch((cause: unknown) => cause)

    await vi.advanceTimersByTimeAsync(1000)
    expect(read).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1999)
    expect(read).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)

    expect(await pending).toBe(timeout)
    expect(read).toHaveBeenCalledTimes(3)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps a dependent subtree blocked after transient recovery', async () => {
    const { read, check } = run()
    read
      .mockRejectedValueOnce(timeout)
      .mockResolvedValue({ ...safeImpact, affectedCount: 1 })
    const pending = check().catch((cause: unknown) => cause)

    await vi.advanceTimersByTimeAsync(1000)

    expect(await pending).toBeInstanceOf(SubnameRecreationError)
    expect(read).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not retry an inventory limit even with a nested timeout', async () => {
    const { read, check } = run()
    const failure = new RpcSubnameInventoryError({
      reason: 'node-limit',
      cause: timeout,
    })
    read.mockRejectedValue(failure)

    await expect(check()).rejects.toBe(failure)
    expect(read).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels the retry wait without starting another read', async () => {
    const { read, check, controller } = run()
    read.mockRejectedValueOnce(timeout).mockResolvedValue(safeImpact)
    const pending = check().catch((cause: unknown) => cause)
    await vi.advanceTimersByTimeAsync(0)

    controller.abort()

    expect(await pending).toBe(controller.signal.reason)
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(3000)
    expect(read).toHaveBeenCalledTimes(1)
  })
})

describe('direct subname source checks', () => {
  it('queues the current head while its canonical inventory check is pending', async () => {
    const context = fixture()
    const original = context.client.getBlock
    let release = () => {}
    let markStarted = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const started = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    const getBlock = vi
      .spyOn(context.client, 'getBlock')
      .mockImplementation(async (args) => {
        if (args?.blockNumber !== undefined) {
          markStarted()
          await gate
        }
        return original(args)
      })
    const pending = context.discover()
    await started
    try {
      expect(getBlock.mock.calls.slice()).toEqual([
        [{ blockNumber: 100n }],
        [{ blockTag: 'latest' }],
      ])
    } finally {
      release()
      expect((await pending).domains.map(({ name }) => name)).toEqual([
        ROOT,
        CHILD,
      ])
    }
  })

  it('uses indexed data only for missing labels, never for child counts or authority', async () => {
    const context = fixture()
    const countRead = vi
      .spyOn(context.indexer, 'name')
      .mockImplementation(() => {
        throw new Error(
          'A count read must not establish RPC inventory completeness',
        )
      })
    const found = await context.discover()
    expect(found.domains.map(({ name }) => name)).toEqual([ROOT, CHILD])
    expect(countRead).not.toHaveBeenCalled()
  })
  it('reports each selected root after its inventory and live children are checked', async () => {
    const { client, indexer } = fixture()
    const onNamesChecked = vi.fn()
    const options = {
      domains: [root],
      owner: OWNER,
      publicClient: client,
      indexer,
      onNamesChecked,
    }
    await discoverSubnameRecreation(options)
    expect(onNamesChecked).toHaveBeenLastCalledWith([ROOT])
  })

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
        ...nameWrapperNamesSnippet,
      ] as const
      const answer = (data: Hex): Hex => {
        const call = decodeFunctionData({ abi, data })
        switch (call.functionName) {
          case 'owner':
            return encodeFunctionResult({
              abi,
              functionName: 'owner',
              result:
                call.args[0] === namehash(ROOT)
                  ? OWNER
                  : V1_CONTRACTS.NameWrapper,
            })
          case 'resolver':
            return encodeFunctionResult({
              abi,
              functionName: 'resolver',
              result: DEFAULT_RESOLVER,
            })
          case 'names':
            return encodeFunctionResult({
              abi,
              functionName: 'names',
              result: '0x',
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
          if (method === 'eth_chainId') return toHex(envConfig.chain.id)
          if (method === 'eth_getCode') return '0x6000'
          if (method === 'eth_getBlockByNumber') return answerBlock(params?.[0])
          if (method === 'eth_getLogs') {
            recordLogFilter(params?.[0])
            const filter = params?.[0] as {
              readonly topics: readonly [string, readonly Hex[]]
              readonly fromBlock: Hex
              readonly toBlock: Hex
            }
            if (
              !filter.topics[1].includes(namehash(ROOT)) ||
              BigInt(filter.fromBlock) > checkpoint ||
              BigInt(filter.toBlock) < checkpoint
            )
              return []
            return rows.map((child, index) => ({
              address: V1_CONTRACTS.LegacyRegistry,
              blockNumber: toHex(checkpoint),
              blockHash: BLOCK_HASH,
              transactionHash: BLOCK_HASH,
              logIndex: toHex(index),
              removed: false,
              topics: encodeEventTopics({
                abi: NEW_OWNER_ABI,
                eventName: 'NewOwner',
                args: {
                  node: namehash(ROOT),
                  label: labelhash(child.name.split('.')[0] ?? ''),
                },
              }),
              data: encodeAbiParameters([{ type: 'address' }], [OTHER]),
            }))
          }
          const data = readCallData(method, params)
          if (data === '0xb83f8663') return '0x'
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
      ).toHaveLength(phase === 'discovery' ? 4 : 2)
      expect([
        ...new Map(
          logNodes.map((nodes) => [
            JSON.stringify([nodes].flat()),
            [nodes].flat(),
          ]),
        ).values(),
      ]).toEqual([[namehash(ROOT)], rows.map(({ namehash }) => namehash)])
      expect(aggregates).toEqual(
        phase === 'discovery' ? [2, 381, 127] : [254, 127],
      )
      expect(
        request.mock.calls
          .filter(([call]) => call.method === 'eth_getLogs')
          .map(([call]) => call.params?.[0])
          .every(
            (filter) =>
              typeof filter === 'object' &&
              filter !== null &&
              'toBlock' in filter &&
              BigInt(String(filter.toBlock)) <= state.head,
          ),
      ).toBe(true)
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
      functionName === 'owner'
        ? ownerReads()
        : functionName === 'names'
          ? '0x'
          : DEFAULT_RESOLVER,
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
        expect(ownerReads).toHaveBeenCalledTimes(rows.length + 1),
      )
    } finally {
      release()
    }
    const found = await discovery

    expect(found.domains.map(({ name }) => name)).toEqual([
      ROOT,
      ...rows.map(({ name }) => name),
    ])
    expect(
      context.request.mock.calls.filter(
        ([call]) => call.method === 'eth_getLogs',
      ),
    ).toHaveLength(2)
    expect(readContract.mock.calls.map(([request]) => request)).toEqual([
      ...[{ namehash: namehash(ROOT) }, ...rows].flatMap((child) => [
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
      ...rows.map((child) =>
        expect.objectContaining({
          functionName: 'names',
          args: [child.namehash],
          blockNumber: 100n,
        }),
      ),
    ])
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
      expect(
        context.readContract.mock.calls.map(([call]) => call.args[0]),
      ).toEqual([namehash(ROOT), namehash(ROOT)])
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
        v1ResolverAddress: getAddress(DEFAULT_RESOLVER),
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
    { case: 'missing count', options: { count: null } },
    { case: 'incorrect count', options: { count: 2 } },
    {
      case: 'duplicate indexed label',
      options: { count: 2, rows: [row, row] },
    },
    { case: 'changing count', options: { total: 2 } },
    {
      case: 'partial publication',
      options: { metadata: { ...meta, completeness: 'partial' as const } },
    },
    {
      case: 'missing publication',
      options: { metadata: { completeness: 'full' as const } },
    },
    {
      case: 'incorrect descendant count',
      options: { rows: [{ ...row, subname_count: 1 }] },
    },
  ])('does not let $case override the RPC tree', async ({ options }) => {
    const found = await fixture(options).discover()
    expect(found.domains.map(({ name }) => name)).toEqual([ROOT, CHILD])
  })

  it.each(['duplicate', 'removed', 'missing-checkpoint'] as const)(
    'rejects %s RPC evidence rather than importing a partial tree',
    async (rpcFault) => {
      await expect(fixture({ rpcFault }).discover()).rejects.toThrow()
    },
  )

  it('fully rereads required recreation branches omitted by an earlier pruning policy', async () => {
    const context = fixture()
    const found = await context.discover()
    const unrelated = { node: namehash('unrelated.eth'), name: 'unrelated.eth' }
    context.request.mockClear()
    const reread = await discoverSubnameRecreation({
      domains: [root],
      owner: OWNER,
      publicClient: context.client,
      indexer: context.indexer,
      inventory: {
        ...found.inventory,
        roots: [...found.inventory.roots, unrelated],
        rootSources: [
          ...found.inventory.rootSources,
          {
            ...unrelated,
            registryOwner: OWNER,
            resolver: zeroAddress,
            wrappedData: null,
          },
        ],
        scannedParentNodes: [namehash(ROOT), unrelated.node],
        unscannedParentNodes: [namehash(CHILD)],
      },
    })
    expect(reread.domains).toEqual(found.domains)
    expect(reread.inventory.roots).toEqual([
      { node: namehash(ROOT), name: ROOT },
    ])
    expect(reread.inventory.scannedParentNodes).toEqual([
      namehash(ROOT),
      namehash(CHILD),
    ])
    expect(
      context.request.mock.calls.filter(
        ([call]) => call.method === 'eth_getLogs',
      ),
    ).toHaveLength(2)
  })

  it('reuses complete recreation branches when only an unrelated frontier is pruned', async () => {
    const context = fixture()
    const found = await context.discover()
    context.request.mockClear()
    const reused = await discoverSubnameRecreation({
      domains: [root],
      owner: OWNER,
      publicClient: context.client,
      indexer: context.indexer,
      inventory: {
        ...found.inventory,
        roots: [
          ...found.inventory.roots,
          { node: namehash('other.eth'), name: 'other.eth' },
        ],
        rootSources: [
          ...found.inventory.rootSources,
          {
            node: namehash('other.eth'),
            name: 'other.eth',
            registryOwner: OWNER,
            resolver: zeroAddress,
            wrappedData: null,
          },
        ],
        nodes: [
          ...found.inventory.nodes,
          {
            node: namehash('independent.other.eth'),
            parentNode: namehash('other.eth'),
            labelhash: labelhash('independent'),
            depth: 1,
            registryOwner: V1_CONTRACTS.NameWrapper,
            resolver: zeroAddress,
            wrappedData: [OTHER, 65536, maxUint64],
            name: 'independent.other.eth',
          },
        ],
        scannedParentNodes: [
          ...found.inventory.scannedParentNodes,
          namehash('other.eth'),
        ],
        unscannedParentNodes: [namehash('independent.other.eth')],
      },
    })
    expect(reused.domains).toEqual(found.domains)
    expect(
      context.request.mock.calls.filter(
        ([call]) => call.method === 'eth_getLogs',
      ),
    ).toEqual([])
  })

  it('rejects a supplied same-head inventory after the RPC connection changes chain', async () => {
    const context = fixture()
    const found = await context.discover()
    const request = context.request.getMockImplementation()
    if (!request) throw new Error('Missing fixture transport')
    context.request.mockImplementation((input) =>
      input.method === 'eth_chainId'
        ? Promise.resolve(toHex(envConfig.chain.id + 1))
        : request(input),
    )
    await expect(
      discoverSubnameRecreation({
        domains: [root],
        owner: OWNER,
        publicClient: context.client,
        indexer: context.indexer,
        inventory: found.inventory,
      }),
    ).rejects.toThrow(/another chain/)
  })

  it('retains validated labels through a delta refresh without another indexer read', async () => {
    const context = fixture()
    const labels = vi.spyOn(context.indexer, 'subnames')
    const found = await context.discover()
    expect(labels).toHaveBeenCalledTimes(1)
    labels.mockClear()
    context.state.head = 101n
    const refreshed = await discoverSubnameRecreation({
      domains: [root],
      owner: OWNER,
      publicClient: context.client,
      indexer: context.indexer,
      inventory: found.inventory,
    })
    expect(labels).not.toHaveBeenCalled()
    expect(refreshed.domains).toEqual(found.domains)
    expect(refreshed.inventory.nodes.map(({ name }) => name)).toEqual([CHILD])
  })

  it('refreshes the supplied inventory delta before reusing reviewed child imports', async () => {
    const context = fixture()
    const found = await context.discover()
    context.state.head = 101n
    context.state.parentEvents = [{ args: { label: labelhash('unindexed') } }]
    await expect(
      discoverSubnameRecreation({
        domains: [root],
        owner: OWNER,
        publicClient: context.client,
        indexer: context.indexer,
        inventory: found.inventory,
      }),
    ).rejects.toThrow(/exact, valid subname label/)
  })

  it('rejects an unindexed child created after the published checkpoint', async () => {
    const context = fixture()
    context.state.head = 101n
    context.state.parentEvents = [{ args: { label: labelhash('unindexed') } }]
    await expect(context.discover()).rejects.toThrow(
      /exact, valid subname label/,
    )
  })

  it.each([
    { case: 'beside a known child', rows: [row, unknownRow] },
    { case: 'as the only child', rows: [unknownRow] },
  ])(
    'keeps checking the parent but leaves an unknown-label child out of the import $case',
    async ({ rows }) => {
      const found = await fixture({ count: rows.length, rows }).discover()
      expect(found.snapshot.roots).toEqual([ROOT])
      expect(found.domains.map(({ name }) => name)).not.toContain(UNKNOWN)
      expect(found.unrecoverable).toEqual([UNKNOWN])
      expect(found.snapshot.skipped).toEqual([UNKNOWN])
    },
  )

  it('still rejects an unknown-label child that has a subname', async () => {
    const context = fixture({ count: 1, rows: [unknownRow] })
    context.state.descendantParent = UNKNOWN
    context.state.descendantEvents = [{ args: { label: labelhash('new') } }]
    await expect(context.discover()).rejects.toThrow(/deeper subnames/)
  })

  it('rejects an unlabelled child the indexer names with a different hash', async () => {
    const other = `[${'cd'.repeat(32)}].${ROOT}`
    const context = fixture({
      count: 1,
      rows: [{ ...unknownRow, name: other, namehash: namehash(other) }],
    })
    context.state.parentEvents = [{ args: { label: `0x${'ab'.repeat(32)}` } }]
    await expect(context.discover()).rejects.toThrow(
      /exact, valid subname label/,
    )
  })

  it('blocks signing when a skipped unknown-label child gains a subname after review', async () => {
    const context = fixture({ count: 1, rows: [unknownRow] })
    const found = await context.discover()
    context.state.head = 101n
    context.state.descendantParent = UNKNOWN
    context.state.descendantEvents = [{ args: { label: labelhash('new') } }]
    await expect(
      assertSubnameRecreationUnchanged({
        ...found,
        publicClient: context.client,
      }),
    ).rejects.toThrow(/descendants changed after review/)
  })

  it('rejects descendants created below any child in the batched log check', async () => {
    const context = fixture()
    context.state.descendantEvents = [
      { args: { label: labelhash('new-leaf') } },
    ]
    await expect(context.discover()).rejects.toThrow(/deeper subnames/)
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

  it('checks every saved fallback registry for new children before signing', async () => {
    const context = fixture()
    const found = await context.discover()
    const oldRegistry = '0x94f523b8261B815b87EFfCf4d18E6aBeF18d6e4b'
    context.state.head = 101n
    context.state.eventRegistry = oldRegistry
    context.state.parentEvents = [
      { args: { label: labelhash('new-old-child') } },
    ]
    await expect(
      assertSubnameRecreationUnchanged({
        ...found,
        snapshot: {
          ...found.snapshot,
          registryAddresses: [V1_CONTRACTS.LegacyRegistry, oldRegistry],
        },
        publicClient: context.client,
      }),
    ).rejects.toThrow(/child inventory changed after review/)
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
