import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import * as v from 'valibot'
import {
  decodeFunctionData,
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionResult,
  getChainContractAddress,
  type Hex,
  isHex,
  labelhash,
  multicall3Abi,
  namehash,
  parseAbi,
  TimeoutError,
  toHex,
  zeroAddress,
  zeroHash,
} from 'viem'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { envConfig } from '@/config'
import { publicClient } from '@/lib/wagmi'
import { V1_CONTRACTS } from '../contracts/addresses'
import { makeClassified, makeDomain, OWNER } from '../service/_fixtures'
import { makeRpcSubnameInventory } from '../service/_fixtures/rpcSubnameInventory'
import { NEW_OWNER_ABI } from '../service/rpcSubnameInventory'
import { getRpcSubnameInventoryCacheKey } from '../service/rpcSubnameInventoryCache'
import { getSubnameMigrationImpactQueryOptions } from '../service/subnameMigrationImpactQuery'
import { createUpgradeReadCoordinator } from '../service/upgradeReadCoordinator'
import { useSubnameMigrationImpact } from './useSubnameMigrationImpact'

const NOW = Math.floor(Date.now() / 1000)
const BLOCK_HASH = namehash('canonical-block')
const BLOCK_NUMBER = 20_000_000n
const ROOT = namehash('alice.eth')
const REGISTRY = getChainContractAddress({
  chain: envConfig.chain,
  contract: 'ensLegacyRegistry',
})
const SOURCE_ABI = parseAbi([
  'function old() view returns (address)',
  'function owner(bytes32 node) view returns (address)',
  'function resolver(bytes32 node) view returns (address)',
  'function names(bytes32 node) view returns (bytes)',
  'function nameExpires(uint256 tokenId) view returns (uint256)',
  'function GRAVEYARD() view returns (address)',
])
const LOG_FILTER_SCHEMA = v.object({
  address: v.string(),
  fromBlock: v.string(),
  toBlock: v.string(),
  topics: v.tuple([v.string(), v.array(v.string())]),
})
type RpcRequest = {
  readonly method: string
  readonly params?: readonly unknown[]
}
const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  rpc: vi.fn(),
  hasChild: false,
  sourceFailure: false,
  historyFailure: false,
  reorg: false,
}))
vi.mock('./useMigrationRecoverySnapshot', () => ({
  useMigrationRecoverySnapshot: () => null,
}))
vi.mock('@/lib/bigname', async () => {
  const { createBignameClient } = await import('@ens-apps/indexer/bigname')
  return {
    bigname: createBignameClient('https://bigname.example', {
      fetch: (...args) => mocks.fetch(...args),
    }),
  }
})
vi.mock('@/lib/wagmi', async () => {
  const { createPublicClient, custom } = await import('viem')
  const { envConfig } = await import('@/config')
  return {
    sepoliaWithEns: envConfig.chain,
    publicClient: createPublicClient({
      chain: envConfig.chain,
      transport: custom(
        { request: (...args) => mocks.rpc(...args) },
        { retryCount: 0 },
      ),
    }),
  }
})

const answerSource = (data: Hex): Hex => {
  const call = decodeFunctionData({ abi: SOURCE_ABI, data })
  switch (call.functionName) {
    case 'owner':
      if (mocks.sourceFailure) throw new Error('Registry source unavailable')
      return encodeFunctionResult({
        abi: SOURCE_ABI,
        functionName: 'owner',
        result: OWNER,
      })
    case 'old':
    case 'resolver':
      return encodeFunctionResult({
        abi: SOURCE_ABI,
        functionName: call.functionName,
        result: zeroAddress,
      })
    case 'names':
      return encodeFunctionResult({
        abi: SOURCE_ABI,
        functionName: 'names',
        result: '0x',
      })
    case 'nameExpires':
      return encodeFunctionResult({
        abi: SOURCE_ABI,
        functionName: 'nameExpires',
        result: BigInt(NOW) + 86_400n,
      })
    case 'GRAVEYARD':
      return encodeFunctionResult({
        abi: SOURCE_ABI,
        functionName: 'GRAVEYARD',
        result: '0x000000000000000000000000000000000000dead',
      })
  }
}
const answerCall = (input: unknown): Hex => {
  if (
    typeof input !== 'object' ||
    input === null ||
    !('data' in input) ||
    typeof input.data !== 'string' ||
    !isHex(input.data)
  )
    throw new Error('Malformed fixture call')
  const data = input.data
  if (!data.startsWith('0x82ad56cb')) return answerSource(data)
  const call = decodeFunctionData({ abi: multicall3Abi, data })
  if (call.functionName !== 'aggregate3')
    throw new Error('Unexpected multicall')
  return encodeFunctionResult({
    abi: multicall3Abi,
    functionName: 'aggregate3',
    result: call.args[0].map(({ callData }) => ({
      success: true,
      returnData: answerSource(callData),
    })),
  })
}
const answerRpc = async ({ method, params }: RpcRequest): Promise<unknown> => {
  switch (method) {
    case 'eth_chainId':
      return toHex(envConfig.chain.id)
    case 'eth_getBlockByNumber':
      return {
        number: toHex(BLOCK_NUMBER),
        timestamp: toHex(NOW),
        hash:
          mocks.reorg && params?.[0] !== 'latest'
            ? namehash('reorganized-block')
            : BLOCK_HASH,
        transactions: [],
      }
    case 'eth_getCode':
      return '0x6000'
    case 'eth_call':
      return answerCall(params?.[0])
    case 'eth_getLogs': {
      if (mocks.historyFailure) throw new Error('Registry history unavailable')
      const filter = v.parse(LOG_FILTER_SCHEMA, params?.[0])
      if (
        !mocks.hasChild ||
        !filter.topics[1].includes(ROOT) ||
        BigInt(filter.fromBlock) > BLOCK_NUMBER ||
        BigInt(filter.toBlock) < BLOCK_NUMBER
      )
        return []
      return [
        {
          address: REGISTRY,
          blockNumber: toHex(BLOCK_NUMBER),
          blockHash: BLOCK_HASH,
          transactionHash: zeroHash,
          logIndex: '0x0',
          removed: false,
          topics: encodeEventTopics({
            abi: NEW_OWNER_ABI,
            eventName: 'NewOwner',
            args: { node: ROOT, label: labelhash('sub') },
          }),
          data: encodeAbiParameters([{ type: 'address' }], [OWNER]),
        },
      ]
    }
    default:
      throw new Error(`Unexpected RPC method: ${method}`)
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.hasChild = false
  mocks.sourceFailure = false
  mocks.historyFailure = false
  mocks.reorg = false
  mocks.rpc.mockImplementation(answerRpc)
  mocks.fetch.mockRejectedValue(new Error('Bigname must not be requested'))
})
afterEach(() => expect(mocks.fetch).not.toHaveBeenCalled())

const requestCount = (method: string) =>
  mocks.rpc.mock.calls.filter(([request]) => request.method === method).length

it('uses prepared inventory only for initial display, then re-reads history before another decision', async () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const coordinator = createUpgradeReadCoordinator({ publicClient })
  const domain = makeDomain({ name: 'alice.eth', id: ROOT })
  queryClient.setQueryData(
    getRpcSubnameInventoryCacheKey({
      ownerAddress: OWNER,
      chainId: envConfig.chain.id,
      registryAddress: V1_CONTRACTS.LegacyRegistry,
      nameWrapperAddress: V1_CONTRACTS.NameWrapper,
    }),
    {
      ...makeRpcSubnameInventory({
        domains: [domain],
        rootNames: [domain.name],
      }),
      checkpoint: {
        number: BLOCK_NUMBER,
        hash: BLOCK_HASH,
        timestamp: BigInt(NOW),
      },
    },
  )
  const options = getSubnameMigrationImpactQueryOptions({
    coordinator,
    ownerAddress: OWNER,
    chainId: envConfig.chain.id,
    migratingNames: ['alice.eth'],
    copiedNames: [],
    renewingNames: [],
    isEnabled: true,
    isPrepared: true,
    hasSelectedNames: true,
    isRefetchEnabled: false,
  })
  try {
    const initial = await queryClient.fetchQuery(options)
    expect(initial.affectedCount).toBe(0)
    expect(requestCount('eth_getLogs')).toBe(0)
    mocks.hasChild = true
    const refreshed = await queryClient.fetchQuery({ ...options, staleTime: 0 })
    expect(refreshed.affectedCount).toBe(1)
  } finally {
    coordinator.dispose()
    queryClient.clear()
  }
})

const run = async () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  await queryClient.fetchQuery(
    getSubnameMigrationImpactQueryOptions({
      ownerAddress: OWNER,
      chainId: envConfig.chain.id,
      migratingNames: ['alice.eth'],
      copiedNames: [],
      renewingNames: [],
      isEnabled: true,
      isPrepared: true,
      hasSelectedNames: true,
    }),
  )
  const wrapper = ({ children }: { readonly children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const initialProps: { readonly managers: readonly string[] } = {
    managers: [],
  }
  const hook = renderHook(
    ({ managers }: { readonly managers: readonly string[] }) =>
      useSubnameMigrationImpact({
        selectedNames: ['alice.eth'],
        classified: [makeClassified({ name: 'alice.eth' })],
        renewingNames: [],
        ownerAddress: OWNER,
        managerRestorationNames: managers,
        isEnabled: true,
        isPrepared: true,
        isRefetchEnabled: false,
      }),
    { wrapper, initialProps },
  )
  return { ...hook, queryClient }
}

describe('fresh start checks with shared impact evidence', () => {
  it.each([
    { stage: 'inventory', hasChild: false, canStart: true, affectedCount: 0 },
    { stage: 'inventory', hasChild: true, canStart: false, affectedCount: 1 },
    { stage: 'checkpoint', hasChild: false, canStart: true, affectedCount: 0 },
  ])(
    'rechecks safety after a transient $stage failure with $affectedCount affected subnames',
    async ({ stage, hasChild, canStart, affectedCount }) => {
      const { result, unmount } = await run()
      const chainReads = requestCount('eth_chainId')
      vi.useFakeTimers()
      try {
        const timeout = new TimeoutError({
          url: 'https://rpc.example',
          body: {},
        })
        if (stage === 'inventory') mocks.rpc.mockRejectedValueOnce(timeout)
        else {
          const canonicalRead = vi.fn()
          mocks.rpc.mockImplementation(async (request: RpcRequest) => {
            if (
              request.method === 'eth_getBlockByNumber' &&
              request.params?.[0] !== 'latest'
            ) {
              canonicalRead()
              if (canonicalRead.mock.calls.length === 2) throw timeout
            }
            return answerRpc(request)
          })
        }
        let check = Promise.resolve(false)
        await act(async () => {
          check = result.current.checkBeforeStart()
          await vi.advanceTimersByTimeAsync(0)
        })
        expect(result.current.status).toBe('loading')
        expect(requestCount('eth_chainId') - chainReads).toBe(1)

        mocks.hasChild = hasChild
        await act(async () => {
          await vi.advanceTimersByTimeAsync(999)
        })
        expect(requestCount('eth_chainId') - chainReads).toBe(1)
        await act(async () => {
          await vi.advanceTimersByTimeAsync(1)
          expect(await check).toBe(canStart)
          await vi.advanceTimersByTimeAsync(1)
        })
        expect(requestCount('eth_chainId') - chainReads).toBe(2)
        expect(result.current.impact?.affectedCount).toBe(affectedCount)
        expect(result.current.isBlocked).toBe(hasChild)
      } finally {
        unmount()
        vi.useRealTimers()
      }
    },
  )

  it('stops after two transient retries and keeps the upgrade blocked', async () => {
    const { result, unmount } = await run()
    const chainReads = requestCount('eth_chainId')
    vi.useFakeTimers()
    try {
      mocks.rpc.mockImplementation(async (request: RpcRequest) => {
        if (request.method === 'eth_chainId')
          throw new TimeoutError({ url: 'https://rpc.example', body: {} })
        return answerRpc(request)
      })
      let check = Promise.resolve(false)
      await act(async () => {
        check = result.current.checkBeforeStart()
        await vi.advanceTimersByTimeAsync(3_001)
      })
      expect(requestCount('eth_chainId') - chainReads).toBe(3)
      expect(result.current.status).toBe('error')
      expect(await check).toBe(false)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000)
      })
      expect(requestCount('eth_chainId') - chainReads).toBe(3)
    } finally {
      unmount()
      vi.useRealTimers()
    }
  })

  it('cancels a transient retry without publishing a successful check', async () => {
    const queryClient = new QueryClient()
    const options = getSubnameMigrationImpactQueryOptions({
      ownerAddress: OWNER,
      chainId: envConfig.chain.id,
      migratingNames: ['alice.eth'],
      copiedNames: [],
      renewingNames: [],
      isEnabled: true,
      isPrepared: true,
      hasSelectedNames: true,
    })
    vi.useFakeTimers()
    try {
      mocks.rpc.mockRejectedValueOnce(
        new TimeoutError({ url: 'https://rpc.example', body: {} }),
      )
      const check = queryClient.fetchQuery(options).catch(() => undefined)
      await vi.advanceTimersByTimeAsync(0)
      expect(queryClient.getQueryState(options.queryKey)?.fetchStatus).toBe(
        'fetching',
      )
      await queryClient.cancelQueries({ queryKey: options.queryKey })
      await vi.advanceTimersByTimeAsync(60_000)
      await check
      expect(requestCount('eth_chainId')).toBe(1)
      expect(queryClient.getQueryData(options.queryKey)).toBeUndefined()
    } finally {
      queryClient.clear()
      vi.useRealTimers()
    }
  })

  it.each(['read', 'backoff'] as const)(
    'rejects cached success when a pre-start check is cancelled during %s',
    async (phase) => {
      const { result, queryClient, unmount } = await run()
      const previous = result.current.impact
      let release = (): void => {}
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      vi.useFakeTimers()
      try {
        mocks.rpc.mockImplementation(async (request: RpcRequest) => {
          if (request.method === 'eth_chainId') {
            if (phase === 'backoff')
              throw new TimeoutError({ url: 'https://rpc.example', body: {} })
            await gate
          }
          return answerRpc(request)
        })
        let check = Promise.resolve(false)
        await act(async () => {
          check = result.current.checkBeforeStart()
          await vi.advanceTimersByTimeAsync(0)
        })
        expect(result.current.status).toBe('loading')
        await act(async () => {
          await queryClient.cancelQueries()
          expect(await check).toBe(false)
        })
        expect(result.current.impact).toBe(previous)
      } finally {
        release()
        unmount()
        vi.useRealTimers()
      }
    },
  )

  it('leaves an idle preview quiet and still verifies the wallet again before starting', async () => {
    vi.useFakeTimers()
    try {
      const { result, unmount } = await run()
      const rpcReads = mocks.rpc.mock.calls.length
      await act(async () => {
        await vi.advanceTimersByTimeAsync(180_000)
      })

      expect(mocks.fetch).not.toHaveBeenCalled()
      expect(mocks.rpc).toHaveBeenCalledTimes(rpcReads)
      await act(async () => {
        expect(await result.current.checkBeforeStart()).toBe(true)
      })
      expect(mocks.rpc).toHaveBeenCalledTimes(rpcReads * 2)
      unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('rechecks registry history and live source values before starting an empty tree', async () => {
    const { result } = await run()
    const historyReads = requestCount('eth_getLogs')
    const contractReads = requestCount('eth_call')

    await act(async () => {
      expect(await result.current.checkBeforeStart()).toBe(true)
    })

    expect(requestCount('eth_getLogs')).toBe(historyReads * 2)
    expect(requestCount('eth_call')).toBe(contractReads * 2)
  })

  it('reads again before every start even when display evidence is fresh', async () => {
    const { result } = await run()
    const rpcReads = mocks.rpc.mock.calls.length
    expect(result.current.status).toBe('ready')
    expect(mocks.fetch).not.toHaveBeenCalled()
    await act(async () => {
      expect(await result.current.checkBeforeStart()).toBe(true)
    })
    expect(mocks.rpc).toHaveBeenCalledTimes(rpcReads * 2)
    await act(async () => {
      expect(await result.current.checkBeforeStart()).toBe(true)
    })
    expect(mocks.rpc).toHaveBeenCalledTimes(rpcReads * 3)
  })

  it('blocks starting when RPC history reveals a newly live child', async () => {
    const { result } = await run()
    mocks.hasChild = true
    await act(async () => {
      expect(await result.current.checkBeforeStart()).toBe(false)
    })
    expect(result.current.status).toBe('ready')
    expect(result.current.impact?.affectedCount).toBe(1)
    expect(result.current.isBlocked).toBe(true)
  })

  it.each(['source', 'history', 'reorg', 'rpc'] as const)(
    'blocks starting when a fresh %s read no longer proves safety',
    async (kind) => {
      const { result } = await run()
      if (kind === 'source') mocks.sourceFailure = true
      if (kind === 'history') mocks.historyFailure = true
      if (kind === 'reorg') mocks.reorg = true
      if (kind === 'rpc')
        mocks.rpc.mockRejectedValueOnce(new Error('RPC unavailable'))
      await act(async () => {
        expect(await result.current.checkBeforeStart()).toBe(false)
      })
    },
  )

  it('rejects a manager revision change during the same canonical query read', async () => {
    const { result, rerender } = await run()
    let release = (): void => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const canonicalRead = vi.fn()
    mocks.rpc.mockImplementation(async (request: RpcRequest) => {
      if (
        request.method === 'eth_getBlockByNumber' &&
        request.params?.[0] !== 'latest'
      ) {
        canonicalRead()
        await gate
      }
      return answerRpc(request)
    })
    const check = result.current.checkBeforeStart()
    await waitFor(() => expect(canonicalRead).toHaveBeenCalledTimes(1))
    rerender({ managers: ['alice.eth'] })
    await act(async () => {
      release()
      expect(await check).toBe(false)
    })
  })
})
