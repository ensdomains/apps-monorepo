import { BignameError } from '@ens-apps/indexer/bigname'
import { encodeContentHash } from '@ensdomains/ensjs/utils'
import {
  publicResolverAbiSnippet,
  publicResolverContenthashSnippet,
  publicResolverMultiAddrSnippet,
  publicResolverSingleAddrSnippet,
  publicResolverTextSnippet,
} from '@ensdomains/ensjs-abi/v1/publicResolver'
import { permissionedResolverResolveSnippet } from '@ensdomains/ensjs-abi/v2/permissionedResolver'
import { errAsync, okAsync } from 'neverthrow'
import {
  type Address,
  BaseError,
  createPublicClient,
  decodeFunctionData,
  ExecutionRevertedError,
  encodeAbiParameters,
  encodeFunctionResult,
  type Hex,
  HttpRequestError,
  http,
  multicall3Abi,
  namehash,
  type PublicClient,
  parseAbi,
  toHex,
  zeroAddress,
  zeroHash,
} from 'viem'
import { mainnet } from 'viem/chains'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  call: vi.fn(),
  readContract: vi.fn(),
  multicall: vi.fn(),
  nameRecords: vi.fn(),
  events: vi.fn(),
}))
vi.mock('@/lib/wagmi', async () => ({
  publicClient: { ...mocks, chain: (await import('@/config')).envConfig.chain },
  sepoliaWithEns: (await import('@/config')).envConfig.chain,
}))
vi.mock('@/lib/bigname', () => ({
  bigname: { nameRecords: mocks.nameRecords, events: mocks.events },
}))

import { envConfig } from '@/config'
import { publicClient } from '@/lib/wagmi'
import type { ServiceRecordSnapshot } from './profileRecordTransactions'
import {
  importResolverRecords,
  type ResolverCopySource,
  readResolverRecords,
  verifyResolverRecords,
} from './resolverImport'

const NAME = 'blog.alice.eth'
const RESOLVER = '0x2222222222222222222222222222222222222222'
const REGISTRY = '0x3333333333333333333333333333333333333333'
const WALLET = '0x1111111111111111111111111111111111111111'
const CONTENT_HASH =
  'ipfs://bafybeibj6lixxzqtsb45ysdjnupvqkufgdvzqbnvmhw2kf7cfkesy7r7d4'
const CUSTOM_KEY = 'org.example.MixedCase'
const source: ResolverCopySource = {
  kind: 'copy',
  resolver: RESOLVER,
  location: { label: 'blog', registryAddress: REGISTRY },
  wallet: WALLET,
  chainId: envConfig.chain.id,
}
const recordAbi = [
  ...publicResolverTextSnippet,
  ...publicResolverSingleAddrSnippet,
  ...publicResolverMultiAddrSnippet,
  ...publicResolverContenthashSnippet,
  ...publicResolverAbiSnippet,
  ...parseAbi([
    'function pubkey(bytes32) view returns (bytes32, bytes32)',
    'function interfaceImplementer(bytes32, bytes4) view returns (address)',
    'function data(bytes32, string) view returns (bytes)',
  ]),
] as const
const RPC_ABI = [
  ...multicall3Abi,
  ...parseAbi(['function supportsInterface(bytes4) view returns (bool)']),
  ...permissionedResolverResolveSnippet,
  ...recordAbi,
] as const
const bytes = (value: Hex) => encodeAbiParameters([{ type: 'bytes' }], [value])
const expected: ServiceRecordSnapshot = {
  texts: [
    { key: 'description', value: 'An existing profile' },
    { key: CUSTOM_KEY, value: '  café\nKeep whitespace  ' },
  ],
  coins: [
    { coinType: 60, value: WALLET },
    { coinType: 2147483658, value: RESOLVER },
  ],
  contentHash: CONTENT_HASH,
  abi: '[{"type":"function","name":"hello","inputs":[],"outputs":[]}]',
}

const fixture = (nameBased = false) => {
  const state = {
    texts: {
      description: 'An existing profile',
      [CUSTOM_KEY]: '  café\nKeep whitespace  ',
    } as Record<string, string>,
    eth: WALLET as Address,
    contentHash: encodeContentHash(CONTENT_HASH),
    abi: '[{"type":"function","name":"hello","inputs":[],"outputs":[]}]',
    resolver: RESOLVER as Address,
    registry: REGISTRY as Address,
    failure: null as 'rpc' | 'unsupported' | 'malformed' | null,
    pubkey: [zeroHash, zeroHash] as readonly [Hex, Hex],
    hasPubkeyFailure: false,
    hasAbiFailure: false,
    interfaces: {} as Record<string, Address>,
    data: {} as Record<string, Hex>,
  }
  const readText = (key: string): Hex => {
    if (key === CUSTOM_KEY && state.failure) {
      if (state.failure === 'rpc') throw new Error('RPC request timed out')
      if (state.failure === 'malformed') return '0x1234'
      throw new BaseError('Unsupported record', {
        cause: new ExecutionRevertedError(),
      })
    }
    return encodeAbiParameters([{ type: 'string' }], [state.texts[key] ?? ''])
  }
  const read = (data: Hex): Hex => {
    const call = decodeFunctionData({ abi: recordAbi, data })
    if (call.args[0] !== namehash(NAME)) throw new Error('Wrong record node')
    switch (call.functionName) {
      case 'text':
        return readText(call.args[1])
      case 'addr':
        return call.args.length === 1
          ? encodeAbiParameters([{ type: 'address' }], [state.eth])
          : bytes(call.args[1] === 2147483658n ? RESOLVER : '0x')
      case 'contenthash':
        return bytes(state.contentHash)
      case 'ABI':
        if (state.hasAbiFailure)
          throw new BaseError('ABI read reverted', {
            cause: new ExecutionRevertedError(),
          })
        return encodeAbiParameters(
          [{ type: 'uint256' }, { type: 'bytes' }],
          [state.abi ? 1n : 0n, toHex(state.abi)],
        )
      case 'pubkey':
        if (state.hasPubkeyFailure) throw new Error('Pubkey RPC failure')
        return encodeAbiParameters(
          [{ type: 'bytes32' }, { type: 'bytes32' }],
          state.pubkey,
        )
      case 'interfaceImplementer':
        return encodeAbiParameters(
          [{ type: 'address' }],
          [state.interfaces[call.args[1]] ?? zeroAddress],
        )
      case 'data':
        return bytes(state.data[call.args[1]] ?? '0x')
    }
  }
  mocks.multicall.mockResolvedValue([{ status: 'success', result: nameBased }])
  mocks.call.mockImplementation(
    async ({ to, data }: { to: Address; data: Hex }) => {
      if (to !== RESOLVER) throw new Error('Wrong source resolver')
      return { data: read(data) }
    },
  )
  mocks.readContract.mockImplementation(
    async ({
      functionName,
      address,
      args,
    }: {
      functionName: string
      address: Address
      args: readonly unknown[]
    }) => {
      switch (functionName) {
        case 'supportsInterface':
          return true
        case 'findRegistries':
          return [zeroAddress, state.registry]
        case 'getResolver':
          return state.resolver
        case 'resolve':
          if (
            address !== RESOLVER ||
            args[0] !== '0x04626c6f6705616c6963650365746800'
          )
            throw new Error('Wrong name-based source')
          return read(args[1] as Hex)
        default:
          throw new Error(`Unexpected contract read: ${functionName}`)
      }
    },
  )
  mocks.nameRecords.mockReturnValue(
    okAsync({
      data: {
        namespace: 'ens',
        resolver: { chain_id: envConfig.chain.id, address: RESOLVER },
        records: {},
        inventory: {
          known_keys: [`text:${CUSTOM_KEY}`, 'addr:2147483658'],
          unset_keys: [],
          unsupported_keys: [],
          abi_content_types: ['1'],
        },
      },
      meta: {},
    }),
  )
  mocks.events.mockReturnValue(
    okAsync({
      data: [
        { type: 'record', data: { key: 'interface:0x12345678' } },
        { type: 'record', data: { key: 'data:org.example.binary' } },
      ],
      page: {
        cursor: null,
        next_cursor: null,
        page_size: 200,
        total_count: 2,
        has_more: false,
      },
      meta: { as_of: {} },
    }),
  )
  return state
}

beforeEach(() => vi.resetAllMocks())

describe('resolver record import', () => {
  it.each([['abi'], ['ABI'], []])(
    'blocks a failed ABI read advertised by the inventory with keys %j',
    async (...knownKeys: string[]) => {
      fixture().hasAbiFailure = true
      mocks.nameRecords.mockReturnValue(
        okAsync({
          data: {
            inventory: {
              known_keys: knownKeys,
              unset_keys: [],
              abi_content_types: ['1'],
            },
          },
        }),
      )
      const imported = await importResolverRecords(NAME, source)
      expect(imported.blockedKeys).toContain('ABI')
    },
  )
  it.each([false, true])(
    'recovers indexed and probed records exactly (name-based: %s)',
    async (nameBased) => {
      fixture(nameBased)
      const imported = await importResolverRecords(NAME, source)
      expect(imported.records).toMatchObject({
        ...expected,
        resolverAddress: RESOLVER,
      })
      expect(imported.records.texts).toHaveLength(2)
      expect(imported.records.coins).toHaveLength(2)
      await expect(
        verifyResolverRecords(
          NAME,
          RESOLVER,
          {
            ...expected,
            abi: '[ { "type": "function", "name": "hello", "inputs": [], "outputs": [] } ]',
          },
          publicClient as PublicClient,
        ),
      ).resolves.toBeUndefined()
    },
  )

  it.each(['rpc', 'unsupported', 'malformed'] as const)(
    'blocks replacement on %s failure while keeping recovered records for review',
    async (failure) => {
      fixture().failure = failure
      const imported = await importResolverRecords(NAME, source)
      expect(imported.records.texts).toEqual([
        { key: 'description', value: 'An existing profile' },
      ])
      expect(imported.blockedKeys).toContain(`text:${CUSTOM_KEY}`)
    },
  )

  it('recovers interface records and V2 binary data from the complete event inventory', async () => {
    const state = fixture(true)
    state.interfaces['0x12345678'] = WALLET
    state.data['org.example.binary'] = '0x00ff0100'
    const imported = await importResolverRecords(NAME, source)
    expect(imported.blockedKeys).toEqual([])
    expect(imported.records.interfaces).toEqual([
      { interfaceId: '0x12345678', implementer: WALLET },
    ])
    expect(imported.records.data).toEqual([
      { key: 'org.example.binary', value: '0x00ff0100' },
    ])
    await expect(
      verifyResolverRecords(
        NAME,
        RESOLVER,
        {
          ...expected,
          interfaces: imported.records.interfaces,
          data: imported.records.data,
        },
        publicClient as PublicClient,
      ),
    ).resolves.toBeUndefined()
    state.data['org.example.binary'] = '0x00ff'
    await expect(
      verifyResolverRecords(
        NAME,
        RESOLVER,
        { ...expected, data: imported.records.data },
        publicClient as PublicClient,
      ),
    ).rejects.toThrow(/could not be verified/)
    state.interfaces['0x12345678'] = RESOLVER
    await expect(
      verifyResolverRecords(
        NAME,
        RESOLVER,
        { ...expected, interfaces: imported.records.interfaces },
        publicClient as PublicClient,
      ),
    ).rejects.toThrow(/could not be verified/)
  })

  it.each(['present', 'read failure'] as const)(
    'blocks a legacy pubkey that is %s',
    async (kind) => {
      const state = fixture()
      state.pubkey = [`0x${'aa'.repeat(32)}`, zeroHash]
      state.hasPubkeyFailure = kind === 'read failure'
      const imported = await importResolverRecords(NAME, source)
      expect(imported.blockedKeys).toContain('pubkey')
    },
  )

  it.each([
    ['indexed inventory', () => mocks.nameRecords],
    ['record event inventory', () => mocks.events],
  ])(
    'blocks replacement until the %s loads, still recovering common records',
    async (_, read) => {
      fixture()
      read().mockReturnValue(
        errAsync(new BignameError({ code: 'network', message: 'offline' })),
      )
      const imported = await importResolverRecords(NAME, source)
      expect(imported.blockedKeys).toEqual(['record inventory'])
      expect(imported.records.texts).toContainEqual({
        key: 'description',
        value: 'An existing profile',
      })
    },
  )

  it.each(['resolver', 'registry'] as const)(
    'rejects an import if its source %s changed while reading',
    async (field) => {
      fixture()[field] = WALLET
      await expect(importResolverRecords(NAME, source)).rejects.toThrow(
        /source resolver changed/,
      )
    },
  )
})

describe('replacement record verification', () => {
  it.each([
    'missing text',
    'changed text',
    'address',
    'contenthash',
    'ABI',
  ] as const)(
    'rejects %s mismatch before resolver replacement',
    async (field) => {
      const state = fixture()
      switch (field) {
        case 'missing text':
          delete state.texts[CUSTOM_KEY]
          break
        case 'changed text':
          state.texts[CUSTOM_KEY] = 'Changed'
          break
        case 'address':
          state.eth = RESOLVER
          break
        case 'contenthash':
          state.contentHash = '0x'
          break
        case 'ABI':
          state.abi = ''
          break
      }
      await expect(
        verifyResolverRecords(
          NAME,
          RESOLVER,
          expected,
          publicClient as PublicClient,
        ),
      ).rejects.toThrow(/replacement records could not be verified/)
    },
  )

  it.each(['rpc', 'unsupported', 'malformed'] as const)(
    'refuses verification when a required record has a %s failure',
    async (failure) => {
      fixture().failure = failure
      await expect(
        verifyResolverRecords(
          NAME,
          RESOLVER,
          { ...expected, texts: [{ key: CUSTOM_KEY, value: '' }] },
          publicClient as PublicClient,
        ),
      ).rejects.toThrow(/replacement records could not be verified/)
    },
  )
})

describe('offchain resolver records', () => {
  const multicallAbi = parseAbi([
    'function multicall(bytes[] data) returns (bytes[] results)',
  ])
  // A CCIP-Read resolver: extended resolution without name-based setters.
  const offchain = (multicallFailure?: Error) => {
    fixture()
    const single = mocks.readContract.getMockImplementation()
    mocks.multicall.mockImplementation(
      async ({ contracts }: { contracts: { args: readonly [Hex] }[] }) =>
        contracts.map(({ args: [id] }) => ({
          status: 'success',
          result: id === '0x9061b923',
        })),
    )
    mocks.readContract.mockImplementation(
      async (request: {
        functionName: string
        address: Address
        args: readonly [Hex, Hex]
      }) => {
        const [dnsName, data] = request.args
        if (
          request.functionName !== 'resolve' ||
          !data.startsWith('0xac9650d8')
        )
          return single?.(request)
        if (multicallFailure) throw multicallFailure
        const { args } = decodeFunctionData({ abi: multicallAbi, data })
        const results = await Promise.all(
          args[0].map((call) =>
            single?.({ ...request, args: [dnsName, call] }),
          ),
        )
        return encodeFunctionResult({
          abi: multicallAbi,
          functionName: 'multicall',
          result: results,
        })
      },
    )
  }
  const resolveCalls = () =>
    mocks.readContract.mock.calls.filter(
      ([request]) => request.functionName === 'resolve',
    )
  const read = () =>
    readResolverRecords({
      name: NAME,
      resolver: RESOLVER,
      texts: ['description', CUSTOM_KEY],
      coins: [60],
      publicClient: publicClient as PublicClient,
    })

  it('reads every record in one gateway request', async () => {
    offchain()

    const { records, readErrors } = await read()

    expect(readErrors).toEqual([])
    expect(records.texts).toEqual(expected.texts)
    expect(records.coins).toEqual([
      expect.objectContaining({ coinType: 60, value: WALLET }),
    ])
    expect(resolveCalls()).toHaveLength(1)
  })

  it('does not fall back to one request per record when the gateway rate limits', async () => {
    offchain(
      new BaseError('Gateway failed', {
        cause: new HttpRequestError({
          url: 'https://gateway.invalid',
          status: 429,
        }),
      }),
    )

    await expect(read()).rejects.toThrow('Gateway failed')
    expect(resolveCalls()).toHaveLength(1)
  })
})

describe('resolver record RPC batching', () => {
  type RpcResult = { readonly success: boolean; readonly returnData: Hex }
  type RpcRequest = {
    readonly id: number
    readonly method: string
    readonly params: readonly [{ readonly data: Hex }]
  }
  const texts = [
    'description',
    CUSTOM_KEY,
    ...Array.from({ length: 10 }, (_, index) => `custom.${index}`),
    'unsupported',
    'malformed',
  ]
  const transportFixture = (hasNameSetters: boolean) => {
    const success = (returnData: Hex): RpcResult => ({
      success: true,
      returnData,
    })
    const readRecord = (data: Hex): RpcResult => {
      const call = decodeFunctionData({ abi: recordAbi, data })
      switch (call.functionName) {
        case 'text':
          if (call.args[1] === 'unsupported')
            return { success: false, returnData: '0x' }
          return success(
            call.args[1] === 'malformed'
              ? '0x1234'
              : encodeAbiParameters(
                  [{ type: 'string' }],
                  [`value:${call.args[1]}`],
                ),
          )
        case 'addr':
          return success(
            call.args.length === 1
              ? encodeAbiParameters([{ type: 'address' }], [WALLET])
              : bytes(RESOLVER),
          )
        case 'contenthash':
          return success(bytes(encodeContentHash(CONTENT_HASH)))
        case 'ABI':
          return success(
            encodeAbiParameters(
              [{ type: 'uint256' }, { type: 'bytes' }],
              [1n, toHex('[]')],
            ),
          )
        default:
          throw new Error(`Unexpected record read: ${call.functionName}`)
      }
    }
    const read = (data: Hex): RpcResult => {
      if (data.startsWith('0xac9650d8'))
        return { success: false, returnData: '0x' }
      const call = decodeFunctionData({ abi: RPC_ABI, data })
      switch (call.functionName) {
        case 'aggregate3':
          return success(
            encodeFunctionResult({
              abi: multicall3Abi,
              functionName: 'aggregate3',
              result: call.args[0].map(({ callData }) => read(callData)),
            }),
          )
        case 'supportsInterface':
          return success(
            encodeAbiParameters(
              [{ type: 'bool' }],
              [call.args[0] === '0x9061b923' || hasNameSetters],
            ),
          )
        case 'resolve': {
          const result = read(call.args[1])
          return result.success ? success(bytes(result.returnData)) : result
        }
        default:
          return readRecord(data)
      }
    }
    const fetchRpc = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const requests = JSON.parse(String(init?.body)) as readonly RpcRequest[]
        return Response.json(
          requests.map(({ id, method, params: [{ data }] }) => {
            if (method !== 'eth_call')
              throw new Error(`Unexpected RPC: ${method}`)
            return { id, jsonrpc: '2.0', result: read(data).returnData }
          }),
        )
      },
    )
    const client = createPublicClient({
      chain: mainnet,
      // Exercise payload splitting with a small record fixture.
      batch: { multicall: { batchSize: 4096, wait: 16 } },
      transport: http('https://rpc.invalid', {
        batch: { batchSize: 20, wait: 16 },
        fetchFn: fetchRpc,
        retryCount: 0,
      }),
    })
    return { client, fetchRpc }
  }

  it.each([
    {
      mode: 'profile',
      hasNameSetters: true,
      maxConcurrentReads: 64,
      maxRequests: 3,
      maxCalls: 64,
    },
    {
      mode: 'import',
      hasNameSetters: true,
      maxConcurrentReads: undefined,
      maxRequests: 4,
      maxCalls: 8,
    },
    {
      mode: 'offchain fallback',
      hasNameSetters: false,
      maxConcurrentReads: 64,
      maxRequests: 5,
      maxCalls: 8,
    },
  ])(
    'preserves every result with bounded $mode batches',
    async ({ hasNameSetters, maxConcurrentReads, maxRequests, maxCalls }) => {
      const { client, fetchRpc } = transportFixture(hasNameSetters)
      const parameters = {
        name: NAME,
        resolver: RESOLVER,
        texts,
        coins: [60, 2147483658],
        shouldDecodeStrictly: false,
        publicClient: client,
        maxConcurrentReads,
      } satisfies Parameters<typeof readResolverRecords>[0]
      const result = await readResolverRecords(parameters)

      expect(result.records).toEqual({
        texts: texts
          .slice(0, -2)
          .map((key) => ({ key, value: `value:${key}` })),
        coins: [
          { coinType: 60, symbol: 'eth', value: WALLET },
          { coinType: 2147483658, symbol: 'op', value: RESOLVER },
        ],
        contentHash: CONTENT_HASH,
        abi: '[]',
        resolverAddress: RESOLVER,
      })
      expect(result.failedKeys).toEqual(['text:unsupported'])
      expect(result.unsupportedKeys).toEqual(['text:unsupported'])
      expect(result.readErrors).toEqual([])
      expect(fetchRpc.mock.calls.length).toBeLessThanOrEqual(maxRequests)

      const calls = fetchRpc.mock.calls.flatMap(([, init]) => {
        const requests = JSON.parse(String(init?.body)) as readonly RpcRequest[]
        return requests.map(({ params: [{ data }] }) => {
          const call = decodeFunctionData({ abi: multicall3Abi, data })
          if (call.functionName !== 'aggregate3')
            throw new Error(`Unexpected multicall: ${call.functionName}`)
          return call.args[0]
        })
      })
      expect(
        calls
          .flat()
          .filter(
            ({ callData }) =>
              callData.startsWith('0x9061b923') &&
              !callData.includes('ac9650d8'),
          ),
      ).toHaveLength(18)
      expect(
        Math.max(...calls.map((batch) => batch.length)),
      ).toBeLessThanOrEqual(maxCalls)
    },
  )
})
