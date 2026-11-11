import { match } from 'ts-pattern'
import type { PublicClient } from 'viem'
import {
  createPublicClient,
  custom,
  encodeAbiParameters,
  encodeEventTopics,
  namehash,
  parseAbi,
  zeroAddress,
  zeroHash,
} from 'viem'
import { mainnet, sepolia } from 'viem/chains'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { resolverRecords, events, lookup, chain } = vi.hoisted(() => ({
  resolverRecords: vi.fn(),
  events: vi.fn(),
  lookup: vi.fn(),
  chain: { id: 11155111 },
}))
vi.mock('@/lib/bigname', () => ({
  bigname: { resolverRecords, events, lookup },
}))
vi.mock('@/config', () => ({ envConfig: { chain } }))

import { fetchV1Profiles } from './fetchV1Profiles'
import { buildProfileMulticallPlan } from './fetchV1Profiles.helpers'
import { getV1ProfileKeys, type V1ProfileSource } from './v1ProfileKeys'
import { RESOLVER_HISTORY_ABI } from './v1ResolverHistory'

const RESOLVER = '0x8fade66b79cc9f707ab26799354482eb93a5b7dd'
const source = (name: string): V1ProfileSource => ({
  id: namehash(name),
  name,
  resolver: RESOLVER,
})
const rpcLogs = vi.fn()
const request = vi.fn(
  async ({
    method,
    params,
  }: {
    readonly method: string
    readonly params?: readonly unknown[]
  }) => {
    if (method === 'eth_chainId') return `0x${chain.id.toString(16)}`
    if (method === 'eth_getBlockByNumber')
      return { number: '0x7b', hash: zeroHash }
    if (method === 'eth_getLogs') return rpcLogs(params)
    throw new Error(`Unexpected ${method}`)
  },
)
const publicClient = createPublicClient({
  transport: custom({ request }, { retryCount: 0 }),
})
const readSources = (
  sources: Parameters<typeof getV1ProfileKeys>[0],
  options: Omit<Parameters<typeof getV1ProfileKeys>[1], 'publicClient'> = {},
) => getV1ProfileKeys(sources, { publicClient, ...options })
const logBase = (name: string, resolver = RESOLVER) => ({
  address: resolver,
  blockNumber: '0x7b',
  blockHash: zeroHash,
  transactionHash: zeroHash,
  logIndex: '0x0',
  removed: false,
  node: namehash(name),
})
const textLog = (name: string, key: string, resolver = RESOLVER) => ({
  ...logBase(name, resolver),
  topics: encodeEventTopics({
    abi: RESOLVER_HISTORY_ABI,
    eventName: 'TextChanged',
    args: { node: namehash(name), indexedKey: key },
  }),
  data: encodeAbiParameters(
    [{ type: 'string' }, { type: 'string' }],
    [key, ''],
  ),
})
const historyLogs = (
  name: string,
  keys: readonly string[],
  resolver = RESOLVER,
) =>
  keys.map((key) => {
    const common = logBase(name, resolver)
    if (key.startsWith('interface:'))
      return {
        ...common,
        topics: encodeEventTopics({
          abi: RESOLVER_HISTORY_ABI,
          eventName: 'InterfaceChanged',
          args: {
            node: common.node,
            interfaceID: key.slice('interface:'.length) as `0x${string}`,
          },
        }),
        data: encodeAbiParameters([{ type: 'address' }], [zeroAddress]),
      }
    if (key.startsWith('dns:'))
      return {
        ...common,
        topics: encodeEventTopics({
          abi: RESOLVER_HISTORY_ABI,
          eventName: 'DNSZonehashChanged',
          args: { node: common.node },
        }),
        data: encodeAbiParameters(
          [{ type: 'bytes' }, { type: 'bytes' }],
          ['0x1234', '0x'],
        ),
      }
    return {
      ...common,
      topics: encodeEventTopics({
        abi: RESOLVER_HISTORY_ABI,
        eventName: 'NameChanged',
        args: { node: common.node },
      }),
      data: encodeAbiParameters([{ type: 'string' }], ['']),
    }
  })

beforeEach(() => {
  chain.id = 11155111
  vi.clearAllMocks()
  rpcLogs.mockReset().mockResolvedValue([])
})

describe('getV1ProfileKeys', () => {
  it('derives every record key from grouped RPC logs without Bigname inventory', async () => {
    const node = namehash('alice.eth')
    const base = logBase('alice.eth')
    rpcLogs.mockResolvedValue([
      textLog('alice.eth', 'custom.key'),
      {
        ...base,
        topics: encodeEventTopics({
          abi: RESOLVER_HISTORY_ABI,
          eventName: 'AddressChanged',
          args: { node },
        }),
        data: encodeAbiParameters(
          [{ type: 'uint256' }, { type: 'bytes' }],
          [2147483658n, '0x'],
        ),
      },
      {
        ...base,
        topics: encodeEventTopics({
          abi: RESOLVER_HISTORY_ABI,
          eventName: 'ABIChanged',
          args: { node, contentType: 1n << 255n },
        }),
        data: '0x',
      },
      {
        ...base,
        topics: encodeEventTopics({
          abi: RESOLVER_HISTORY_ABI,
          eventName: 'ContenthashChanged',
          args: { node },
        }),
        data: encodeAbiParameters([{ type: 'bytes' }], ['0x']),
      },
    ])
    expect((await readSources([source('alice.eth')]))._unsafeUnwrap()).toEqual([
      {
        id: node,
        texts: ['custom.key'],
        coinTypes: [2147483658n],
        hasContentHash: true,
        abiContentTypes: [1n << 255n],
        interfaceIds: [],
      },
    ])
    expect(lookup).not.toHaveBeenCalled()
    expect(resolverRecords).not.toHaveBeenCalled()
    expect(events).not.toHaveBeenCalled()
  })

  it('groups multiple sources while preserving source order and reporting only verified inventories', async () => {
    const names = ['alice.eth', 'bob.eth']
    rpcLogs.mockResolvedValue(
      names.flatMap((name) => historyLogs(name, ['interface:0x12345678'])),
    )
    const onNamesRead = vi.fn<(names: readonly string[]) => void>()
    const result = await readSources(names.map(source), { onNamesRead })
    expect(
      result
        ._unsafeUnwrap()
        .map(({ id, interfaceIds }) => ({ id, interfaceIds })),
    ).toEqual(
      names.map((name) => ({
        id: namehash(name),
        interfaceIds: ['0x12345678'],
      })),
    )
    expect(rpcLogs).toHaveBeenCalledTimes(1)
    expect(onNamesRead).toHaveBeenLastCalledWith(names)
  })

  it('retains cleared interface ids and reverse-name history for the chain read', async () => {
    rpcLogs.mockResolvedValue(
      historyLogs('alice.eth', [
        'interface:0x01ffc9a7',
        'interface:0x01ffc9a7',
        'interface:0x12345678',
        'name',
      ]),
    )
    const [keys] = (await readSources([source('alice.eth')]))._unsafeUnwrap()
    expect(keys?.interfaceIds).toEqual(['0x01ffc9a7', '0x12345678'])
    expect(keys?.hasName).toBe(true)
  })

  it('refuses cleared DNS history and identifies the affected name', async () => {
    rpcLogs.mockResolvedValue(historyLogs('dns-owner.eth', ['dns:zonehash']))
    const onNamesRead = vi.fn()
    const result = await readSources([source('dns-owner.eth')], { onNamesRead })
    expect(result._unsafeUnwrapErr().cause).toMatchObject({
      name: 'UnsupportedResolverRecordsError',
      ensName: 'dns-owner.eth',
      recordType: 'dns',
    })
    expect(onNamesRead).not.toHaveBeenCalled()
  })

  it('reads legacy text history from the requested historical source resolver', async () => {
    chain.id = 1
    const resolver = '0x5FfC014343cd971B7eb70732021E26C35B744cc4'
    const abi = parseAbi([
      'event TextChanged(bytes32 indexed node, string indexed indexedKey, string key)',
    ])
    rpcLogs.mockResolvedValue([
      {
        ...logBase('alice.eth', resolver),
        topics: encodeEventTopics({
          abi,
          eventName: 'TextChanged',
          args: { node: namehash('alice.eth'), indexedKey: 'legacy.key' },
        }),
        data: encodeAbiParameters([{ type: 'string' }], ['legacy.key']),
      },
    ])
    const keys = (
      await readSources([{ ...source('alice.eth'), resolver }])
    )._unsafeUnwrap()
    expect(keys[0]?.texts).toEqual(['legacy.key'])
    const plan = buildProfileMulticallPlan(
      keys,
      new Map([
        [
          namehash('alice.eth'),
          {
            name: 'alice.eth',
            nodeHex: namehash('alice.eth'),
            v1ResolverAddress: resolver,
          },
        ],
      ]),
      1,
    )
    expect(plan.contracts.map(({ functionName }) => functionName)).toEqual([
      'text',
      'content',
      'pubkey',
    ])
  })

  it.each([
    '0xda1756bb923af5d1a05e277cb1e54f1d0a127890',
    '0xf58d55f06bb92f083e78bb5063a2dd3544f9b6a3',
  ] as const)(
    'copies ETH but refuses a stored name on address-only resolver %s without inventory requests',
    async (resolver) => {
      chain.id = 1
      let storedName = ''
      const client = createPublicClient({
        chain: mainnet,
        transport: custom({ request }, { retryCount: 0 }),
      }).extend(() => ({
        multicall: vi.fn(async () => [
          {
            status: 'success',
            result: '0x0000000000000000000000000000000000001234',
          },
          { status: 'success', result: storedName },
        ]),
      })) as PublicClient
      const names = [
        {
          name: 'alice.eth',
          nodeHex: namehash('alice.eth'),
          v1ResolverAddress: resolver,
        },
      ]
      const profiles = await fetchV1Profiles({ names, publicClient: client })
      expect(profiles.get(namehash('alice.eth'))?.addresses).toEqual([
        { coinType: 60n, value: '0x0000000000000000000000000000000000001234' },
      ])
      expect(request).not.toHaveBeenCalled()
      storedName = 'keep-me.eth'
      await expect(
        fetchV1Profiles({ names, publicClient: client }),
      ).rejects.toMatchObject({
        name: 'UnsupportedResolverRecordsError',
        ensName: 'alice.eth',
        recordType: 'name',
      })
    },
  )

  it('preserves the contenthash and pubkey probes for an empty log inventory', async () => {
    const keys = (await readSources([source('alice.eth')]))._unsafeUnwrap()
    const node = namehash('alice.eth')
    const plan = buildProfileMulticallPlan(
      keys,
      new Map([
        [
          node,
          { name: 'alice.eth', nodeHex: node, v1ResolverAddress: RESOLVER },
        ],
      ]),
      chain.id,
    )
    expect(plan.contracts.map(({ functionName }) => functionName)).toEqual([
      'contenthash',
      'pubkey',
    ])
  })

  it('reads current ABI values beyond conventional encodings and excludes cleared text values', async () => {
    const node = namehash('alice.eth')
    const coinType = (1n << 255n) + 1n
    rpcLogs.mockResolvedValue([
      textLog('alice.eth', 'cleared.key'),
      {
        ...logBase('alice.eth'),
        topics: encodeEventTopics({
          abi: RESOLVER_HISTORY_ABI,
          eventName: 'AddressChanged',
          args: { node },
        }),
        data: encodeAbiParameters(
          [{ type: 'uint256' }, { type: 'bytes' }],
          [coinType, '0x'],
        ),
      },
      ...[16n, 1n << 255n].map((contentType) => ({
        ...logBase('alice.eth'),
        topics: encodeEventTopics({
          abi: RESOLVER_HISTORY_ABI,
          eventName: 'ABIChanged',
          args: { node, contentType },
        }),
        data: '0x',
      })),
    ])
    const multicall = vi.fn(
      async ({
        contracts,
      }: {
        readonly contracts: readonly {
          readonly functionName: string
          readonly args: readonly unknown[]
        }[]
      }) =>
        contracts.map(({ functionName, args }) => ({
          status: 'success',
          result: match(functionName)
            .with('ABI', () => [args[1], args[1] === 16n ? '0x1234' : '0xabcd'])
            .with('pubkey', () => [zeroHash, zeroHash])
            .with('addr', () => {
              expect(args).toEqual([node, coinType])
              return '0x12345678'
            })
            .with('contenthash', () => '0x')
            .otherwise(() => ''),
        })),
    )
    const profiles = await fetchV1Profiles({
      names: [
        { name: 'alice.eth', nodeHex: node, v1ResolverAddress: RESOLVER },
      ],
      publicClient: createPublicClient({
        chain: sepolia,
        transport: custom({ request }, { retryCount: 0 }),
      }).extend(() => ({ multicall })) as PublicClient,
    })
    expect(profiles.get(node)?.abis).toEqual([
      { contentType: 16n, value: '0x1234' },
      { contentType: 1n << 255n, value: '0xabcd' },
    ])
    expect(profiles.get(node)?.texts).toEqual([])
    expect(profiles.get(node)?.addresses).toEqual([
      { coinType, value: '0x12345678' },
    ])
  })

  it.each(['malformed', 'unavailable'] as const)(
    'fails closed when RPC history is %s',
    async (failure) => {
      if (failure === 'malformed') rpcLogs.mockResolvedValue(null)
      else rpcLogs.mockRejectedValue(new Error('RPC unavailable'))
      const onNamesRead = vi.fn()
      const result = await readSources([source('alice.eth')], { onNamesRead })
      expect(result.isErr()).toBe(true)
      expect(onNamesRead).not.toHaveBeenCalled()
    },
  )

  it.each([
    { resolver: '0x0000000000000000000000000000000000001234', chainId: 1 },
    { resolver: RESOLVER, chainId: 1 },
    { resolver: RESOLVER, chainId: 31337 },
  ] as const)(
    'refuses uncertified resolver history for %j before RPC',
    async ({ resolver, chainId }) => {
      expect(
        (
          await readSources([{ ...source('alice.eth'), resolver }], { chainId })
        ).isErr(),
      ).toBe(true)
      expect(request).not.toHaveBeenCalled()
    },
  )

  it('honors cancellation after history and within progress callbacks', async () => {
    const controller = new AbortController()
    const onNamesRead = vi.fn(() => controller.abort())
    expect(
      (
        await readSources([source('alice.eth')], {
          signal: controller.signal,
          onNamesRead,
        })
      )._unsafeUnwrapErr().cause,
    ).toBe(controller.signal.reason)
  })
})
