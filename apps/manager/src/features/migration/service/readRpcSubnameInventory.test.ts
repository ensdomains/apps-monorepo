import {
  encodeAbiParameters,
  encodeEventTopics,
  labelhash,
  namehash,
  type PublicClient,
  stringToHex,
  zeroAddress,
  zeroHash,
} from 'viem'
import { describe, expect, it, vi } from 'vitest'
import {
  type RpcSubnameInventory,
  type RpcSubnameInventoryParameters,
  readRpcSubnameInventory,
} from './readRpcSubnameInventory'
import { NEW_OWNER_ABI, NEW_OWNER_TOPIC } from './rpcSubnameInventory'

const REGISTRY = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e'
const OLD = '0x94f523b8261B815b87EFfCf4d18E6aBeF18d6e4b'
const WRAPPER = '0x0635513f179D50A207757E05759CbD106d7dFcE8'
const OWNER = '0x1234567890123456789012345678901234567890'
const ROOT = namehash('parent.eth')
const CHILD = namehash('child.parent.eth')
const GRANDCHILD = namehash('deep.child.parent.eth')
const NEW_CHILD = namehash('new.parent.eth')
const NEW_LEAF = namehash('leaf.new.parent.eth')
const BLOCK = { number: '0x64', hash: zeroHash, timestamp: '0x6553f100' }

const event = (parent: `0x${string}`, label: string, address: string) => ({
  address,
  blockNumber: '0x32',
  blockHash: zeroHash,
  transactionHash: zeroHash,
  logIndex: parent === ROOT ? '0x0' : '0x1',
  removed: false,
  topics: encodeEventTopics({
    abi: NEW_OWNER_ABI,
    eventName: 'NewOwner',
    args: { node: parent, label: labelhash(label) },
  }),
  data: encodeAbiParameters([{ type: 'address' }], [OWNER]),
})

const setup = (
  options: { readonly reorg?: boolean; readonly abort?: AbortController } = {},
) => {
  const state = { head: 100n, owner: OWNER, hasNewChild: false }
  let blockReads = 0
  const request = vi.fn(
    async ({
      method,
      params,
    }: {
      readonly method: string
      readonly params?: readonly unknown[]
    }) => {
      if (method === 'eth_chainId') return '0xaa36a7'
      if (method === 'eth_getBlockByNumber') {
        blockReads += 1
        const number =
          params?.[0] === 'latest' ? state.head : BigInt(String(params?.[0]))
        const block = { ...BLOCK, number: `0x${number.toString(16)}` }
        return options.reorg && blockReads > 1
          ? { ...BLOCK, hash: namehash('reorg.eth') }
          : block
      }
      if (method === 'eth_getCode') return '0x6000'
      if (method === 'eth_call') {
        const call = params?.[0] as { readonly to: string }
        return call.to.toLowerCase() === REGISTRY.toLowerCase()
          ? encodeAbiParameters([{ type: 'address' }], [OLD])
          : '0x'
      }
      if (method === 'eth_getLogs') {
        options.abort?.abort(new Error('stopped'))
        const filter = params?.[0] as {
          readonly address: string | readonly string[]
          readonly topics: readonly [string, readonly string[]]
          readonly fromBlock: string
          readonly toBlock: string
        }
        const logs = [
          event(ROOT, 'child', OLD),
          event(CHILD, 'deep', REGISTRY),
          ...(state.hasNewChild
            ? [
                {
                  ...event(ROOT, 'new', REGISTRY),
                  blockNumber: '0x65',
                  logIndex: '0x1',
                },
                {
                  ...event(NEW_CHILD, 'leaf', REGISTRY),
                  blockNumber: '0x65',
                  logIndex: '0x2',
                },
              ]
            : []),
        ]
        return logs.filter(
          (log) =>
            (typeof filter.address === 'string'
              ? [filter.address]
              : filter.address
            ).some(
              (address) => log.address.toLowerCase() === address.toLowerCase(),
            ) &&
            filter.topics[1].includes(String(log.topics[1])) &&
            BigInt(log.blockNumber) >= BigInt(filter.fromBlock) &&
            BigInt(log.blockNumber) <= BigInt(filter.toBlock),
        )
      }
      throw new Error(`Unexpected ${method}`)
    },
  )
  const multicall = vi.fn(
    async ({
      contracts,
    }: {
      readonly contracts: readonly {
        readonly functionName: string
        readonly args: readonly unknown[]
      }[]
    }) =>
      contracts.map(({ functionName, args }) => {
        if (functionName === 'owner') return state.owner
        if (functionName === 'resolver') return zeroAddress
        if (functionName === 'names')
          return args[0] === CHILD
            ? stringToHex('\x05child\x06parent\x03eth\x00')
            : '0x'
        throw new Error(`Unexpected ${functionName}`)
      }),
  )
  const publicClient = { request, multicall } as Pick<
    PublicClient,
    'request' | 'multicall'
  >
  const run = (
    maxDepth?: number,
    previousInventory?: RpcSubnameInventory,
    scanDescendants?: RpcSubnameInventoryParameters['scanDescendants'],
  ) =>
    readRpcSubnameInventory({
      publicClient,
      chainId: 11155111,
      registryAddress: REGISTRY,
      nameWrapperAddress: WRAPPER,
      roots: [{ node: ROOT, name: 'parent.eth' }],
      maxDepth,
      previousInventory,
      scanDescendants,
      signal: options.abort?.signal,
    })
  return { run, request, multicall, state }
}

describe('readRpcSubnameInventory', () => {
  it('reads both registry layers in one request per complete parent frontier', async () => {
    const context = setup()
    const inventory = await context.run()
    expect(inventory.nodes.map(({ node }) => node)).toEqual([CHILD, GRANDCHILD])
    expect(
      context.request.mock.calls
        .filter(([call]) => call.method === 'eth_getLogs')
        .map(([call]) => call.params?.[0]),
    ).toEqual(
      [ROOT, CHILD, GRANDCHILD].map((node) => ({
        address: [REGISTRY, OLD],
        fromBlock: '0x0',
        toBlock: '0x64',
        topics: [NEW_OWNER_TOPIC, [node]],
      })),
    )
  })

  it('splits emitters at a single-block single-parent provider response limit', async () => {
    const context = setup()
    context.state.head = 0n
    const original = context.request.getMockImplementation()
    if (!original) throw new Error('Missing inventory transport')
    context.request.mockImplementation(async (call) => {
      if (call.method === 'eth_getLogs') {
        const filter = call.params?.[0] as {
          readonly address: string | readonly string[]
        }
        if (typeof filter.address !== 'string' && filter.address.length > 1)
          throw new Error('query returned more than the maximum results')
      }
      return original(call)
    })
    const inventory = await context.run()
    expect(inventory.scannedParentNodes).toEqual([ROOT])
    expect(inventory.nodes).toEqual([])
    expect(
      context.request.mock.calls
        .filter(([call]) => call.method === 'eth_getLogs')
        .map(([call]) => call.params?.[0]),
    ).toEqual([
      {
        address: [REGISTRY, OLD],
        fromBlock: '0x0',
        toBlock: '0x0',
        topics: [NEW_OWNER_TOPIC, [ROOT]],
      },
      {
        address: REGISTRY,
        fromBlock: '0x0',
        toBlock: '0x0',
        topics: [NEW_OWNER_TOPIC, [ROOT]],
      },
      {
        address: OLD,
        fromBlock: '0x0',
        toBlock: '0x0',
        topics: [NEW_OWNER_TOPIC, [ROOT]],
      },
    ])
  })

  it('starts the registry getter while its mandatory code read is pending', async () => {
    const context = setup()
    const original = context.request.getMockImplementation()
    if (!original) throw new Error('Missing inventory transport')
    const deferred = () => {
      let resolve = () => {}
      const promise = new Promise<void>((onResolve) => {
        resolve = onResolve
      })
      return { promise, resolve }
    }
    const started = deferred()
    const code = deferred()
    context.request.mockImplementation(async (call) => {
      if (call.method === 'eth_getCode') {
        started.resolve()
        return code.promise.then(() => '0x6000')
      }
      return original(call)
    })
    const pending = context.run()
    await started.promise
    try {
      expect(
        context.request.mock.calls.some(([call]) => call.method === 'eth_call'),
      ).toBe(true)
    } finally {
      code.resolve()
      await pending
    }
  })

  it('rejects missing registry code even when its getter returns empty', async () => {
    const context = setup()
    const original = context.request.getMockImplementation()
    if (!original) throw new Error('Missing inventory transport')
    context.request.mockImplementation(async (call) => {
      if (call.method === 'eth_getCode' || call.method === 'eth_call')
        return '0x'
      return original(call)
    })
    await expect(context.run()).rejects.toThrow(/no code/)
  })

  it('finds descendants inherited from the old registry and reads both roots and children at one checkpoint', async () => {
    const { run, multicall } = setup()
    const inventory = await run()
    expect(
      inventory.nodes.map(({ node, parentNode, name }) => ({
        node,
        parentNode,
        name,
      })),
    ).toEqual([
      { node: CHILD, parentNode: ROOT, name: 'child.parent.eth' },
      { node: GRANDCHILD, parentNode: CHILD, name: null },
    ])
    expect(
      inventory.rootSources.map(({ node, registryOwner }) => ({
        node,
        registryOwner,
      })),
    ).toEqual([{ node: ROOT, registryOwner: OWNER }])
    expect(inventory.unscannedParentNodes).toEqual([])
    expect(
      multicall.mock.calls.every(
        ([call]) => 'blockNumber' in call && call.blockNumber === 100n,
      ),
    ).toBe(true)
  })

  it('marks the frontier incomplete when a depth limit prevents scanning grandchildren', async () => {
    const inventory = await setup().run(2)
    expect(inventory.scannedParentNodes).toEqual([ROOT, CHILD])
    expect(inventory.unscannedParentNodes).toEqual([GRANDCHILD])
  })

  it('does not read wrapper names for exact local preimages', async () => {
    const context = setup()
    await context.run()
    const names = context.multicall.mock.calls.flatMap(([call]) =>
      call.contracts
        .filter(({ functionName }) => functionName === 'names')
        .map(({ args }) => args[0]),
    )
    expect(names).toEqual([CHILD, GRANDCHILD])
  })

  it('uses pinned child facts to prune preserved branches while always scanning explicit roots', async () => {
    const context = setup()
    const policy = vi.fn(() => false)
    const inventory = await context.run(undefined, undefined, policy)
    expect(inventory.nodes.map(({ node }) => node)).toEqual([CHILD])
    expect(inventory.scannedParentNodes).toEqual([ROOT])
    expect(inventory.unscannedParentNodes).toEqual([CHILD])
    expect(policy.mock.calls).toEqual([
      [
        {
          node: CHILD,
          registryOwner: OWNER,
          resolver: zeroAddress,
          wrappedData: null,
          name: 'child.parent.eth',
        },
        inventory.checkpoint,
      ],
    ])
    expect(
      context.multicall.mock.calls.flatMap(([call]) =>
        call.contracts
          .filter(({ functionName }) => functionName === 'owner')
          .map(({ args }) => args[0]),
      ),
    ).toEqual([ROOT, CHILD])
  })

  it('does not scan cached descendants beneath a newly pruned boundary during a delta replay', async () => {
    const context = setup()
    const previous = await context.run()
    context.request.mockClear()
    context.state.head = 101n
    const inventory = await context.run(
      undefined,
      previous,
      (source) => source.node !== CHILD,
    )
    expect(inventory.nodes.map(({ node }) => node)).toEqual([CHILD, GRANDCHILD])
    expect(inventory.scannedParentNodes).toEqual([ROOT])
    expect(inventory.unscannedParentNodes).toEqual([CHILD, GRANDCHILD])
    expect(
      context.request.mock.calls
        .filter(([call]) => call.method === 'eth_getLogs')
        .map(([call]) => call.params?.[0]),
    ).toEqual([
      {
        address: [REGISTRY, OLD],
        fromBlock: '0x65',
        toBlock: '0x65',
        topics: [NEW_OWNER_TOPIC, [ROOT]],
      },
    ])
  })

  it('reopens an earlier pruned branch from genesis when its current policy requires scanning', async () => {
    const context = setup()
    const previous = await context.run(undefined, undefined, () => false)
    context.request.mockClear()
    context.state.head = 101n
    const inventory = await context.run(undefined, previous, () => true)
    expect(inventory.nodes.map(({ node }) => node)).toEqual([CHILD, GRANDCHILD])
    expect(inventory.unscannedParentNodes).toEqual([])
    expect(
      context.request.mock.calls
        .filter(([call]) => call.method === 'eth_getLogs')
        .map(([call]) => call.params?.[0]),
    ).toContainEqual({
      address: [REGISTRY, OLD],
      fromBlock: '0x0',
      toBlock: '0x65',
      topics: [NEW_OWNER_TOPIC, [CHILD]],
    })
  })

  it.each(['reorg', 'network'] as const)(
    'does not classify %s failures as a partitionable resource limit',
    async (failure) => {
      const context = setup({ reorg: failure === 'reorg' })
      if (failure === 'network')
        context.request.mockRejectedValue(new Error('network unavailable'))
      await expect(context.run()).rejects.toMatchObject({
        reason: 'read-failed',
      })
    },
  )

  it('rejects a reorg across the inventory read', async () => {
    await expect(setup({ reorg: true }).run()).rejects.toThrow(/checkpoint/i)
  })

  it('does not publish any tree after aborting in log discovery', async () => {
    const abort = new AbortController()
    const { run, multicall } = setup({ abort })
    await expect(run()).rejects.toThrow('stopped')
    expect(
      multicall.mock.calls.flatMap(([call]) =>
        call.contracts.map(({ args }) => args[0]),
      ),
    ).toEqual([ROOT, ROOT])
  })

  it('replays only the canonical delta while refreshing every source', async () => {
    const context = setup()
    const previous = await context.run()
    context.request.mockClear()
    context.state.head = 101n
    context.state.owner = zeroAddress
    const inventory = await context.run(undefined, previous)
    const logCalls = context.request.mock.calls.filter(
      ([call]) => call.method === 'eth_getLogs',
    )
    expect(
      logCalls.map(
        ([call]) =>
          (call.params?.[0] as { fromBlock: string } | undefined)?.fromBlock,
      ),
    ).toEqual(['0x65'])
    expect(
      inventory.nodes.map(({ node, registryOwner }) => ({
        node,
        registryOwner,
      })),
    ).toEqual([
      { node: CHILD, registryOwner: zeroAddress },
      { node: GRANDCHILD, registryOwner: zeroAddress },
    ])
  })

  it('fully scans new descendant nodes found during a delta replay', async () => {
    const context = setup()
    const previous = await context.run()
    context.request.mockClear()
    context.state.head = 101n
    context.state.hasNewChild = true
    const inventory = await context.run(undefined, previous)
    expect(inventory.nodes.map(({ node }) => node)).toEqual([
      CHILD,
      GRANDCHILD,
      NEW_CHILD,
      NEW_LEAF,
    ])
    const scans = context.request.mock.calls
      .filter(([call]) => call.method === 'eth_getLogs')
      .map(([call]) => call.params?.[0])
    expect(scans).toContainEqual({
      address: [REGISTRY, OLD],
      fromBlock: '0x0',
      toBlock: '0x65',
      topics: [NEW_OWNER_TOPIC, [NEW_CHILD]],
    })
    expect(inventory.unscannedParentNodes).toEqual([])
  })

  it('rejects reuse from another source chain or a changed checkpoint', async () => {
    const context = setup()
    const previous = await context.run()
    await expect(
      context.run(undefined, { ...previous, chainId: 1 }),
    ).rejects.toThrow(/different selection or source chain/)
    await expect(
      context.run(undefined, {
        ...previous,
        checkpoint: { ...previous.checkpoint, hash: namehash('old-fork.eth') },
      }),
    ).rejects.toThrow(/no longer canonical/)
  })
})
