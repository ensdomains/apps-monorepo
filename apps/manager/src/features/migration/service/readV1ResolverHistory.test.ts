import {
  createPublicClient,
  custom,
  encodeEventTopics,
  namehash,
  parseAbi,
  toHex,
  zeroHash,
} from 'viem'
import { describe, expect, it, vi } from 'vitest'
import { readV1ResolverHistory } from './readV1ResolverHistory'

const source = {
  id: namehash('alice.eth'),
  name: 'alice.eth',
  resolver: '0x0000000000000000000000000000000000001234',
} as const
const deferred = () => {
  let resolve = () => {}
  const promise = new Promise<void>((onResolve) => {
    resolve = onResolve
  })
  return { promise, resolve }
}
const makeClient = ({
  logs = async (_params: unknown): Promise<unknown> => [],
  head = 123n,
  confirmedHash = zeroHash,
  chain = '0x1',
}: {
  readonly logs?: (params: unknown) => Promise<unknown>
  readonly head?: bigint
  readonly confirmedHash?: string
  readonly chain?: string
} = {}) => {
  const request = vi.fn(
    async ({
      method,
      params,
    }: {
      readonly method: string
      readonly params?: readonly unknown[]
    }) => {
      if (method === 'eth_chainId') return chain
      if (method === 'eth_getBlockByNumber')
        return {
          number: toHex(head),
          hash: params?.[0] === 'latest' ? zeroHash : confirmedHash,
        }
      if (method === 'eth_getLogs') return logs(params)
      throw new Error(`Unexpected ${method}`)
    },
  )
  return {
    publicClient: createPublicClient({
      transport: custom({ request }, { retryCount: 0 }),
    }),
    request,
  }
}

describe('readV1ResolverHistory', () => {
  it('confirms history through the fresh verification client and rejects its changed checkpoint', async () => {
    const { publicClient } = makeClient()
    const verification = makeClient({ confirmedHash: namehash('changed.eth') })
    const result = await readV1ResolverHistory({
      sources: [source],
      publicClient,
      verificationClient: verification.publicClient,
      chainId: 1,
    })
    expect(result._unsafeUnwrapErr().cause).toMatchObject({
      message: 'Resolver history checkpoint changed during the read',
    })
    expect(verification.request.mock.calls.map(([request]) => request)).toEqual(
      [{ method: 'eth_getBlockByNumber', params: ['0x7b', false] }],
    )
  })

  it('queues the checkpoint while the chain check is still pending, without starting history early', async () => {
    const { publicClient, request } = makeClient()
    const original = request.getMockImplementation()
    if (!original) throw new Error('Missing resolver history transport')
    const started = deferred()
    const gate = deferred()
    request.mockImplementation(async (args) => {
      if (args.method === 'eth_chainId') {
        started.resolve()
        await gate.promise
      }
      return original(args)
    })
    const pending = readV1ResolverHistory({
      sources: [source],
      publicClient,
      chainId: 1,
    })
    await started.promise
    try {
      expect(request.mock.calls.map(([args]) => args.method)).toEqual([
        'eth_chainId',
        'eth_getBlockByNumber',
      ])
    } finally {
      gate.resolve()
      expect((await pending)._unsafeUnwrap()).toEqual([])
    }
  })

  it('requests and rejects legacy DNSZoneCleared history', async () => {
    const abi = parseAbi(['event DNSZoneCleared(bytes32 indexed node)'])
    const topics = encodeEventTopics({
      abi,
      eventName: 'DNSZoneCleared',
      args: { node: source.id },
    })
    const { publicClient } = makeClient({
      logs: async (params) =>
        JSON.stringify(params).includes(topics[0])
          ? [
              {
                address: source.resolver,
                blockNumber: '0x7b',
                blockHash: zeroHash,
                transactionHash: zeroHash,
                logIndex: '0x0',
                removed: false,
                topics,
                data: '0x',
              },
            ]
          : [],
    })
    const result = await readV1ResolverHistory({
      sources: [source],
      publicClient,
      chainId: 1,
    })
    expect(result._unsafeUnwrapErr().cause).toMatchObject({
      ensName: source.name,
      recordType: 'dns',
    })
  })

  it('pins the head, queries inclusive disjoint ranges with node topics and verifies the same checkpoint', async () => {
    const { publicClient, request } = makeClient({ head: 1_000_000n })
    expect(
      (
        await readV1ResolverHistory({
          sources: [source],
          publicClient,
          chainId: 1,
        })
      )._unsafeUnwrap(),
    ).toEqual([])
    expect(
      request.mock.calls
        .filter(([{ method }]) => method === 'eth_getLogs')
        .map(([{ params }]) => params),
    ).toEqual([
      [
        {
          address: source.resolver,
          fromBlock: '0x0',
          toBlock: '0xf423f',
          topics: [expect.any(Array), [source.id]],
        },
      ],
      [
        {
          address: source.resolver,
          fromBlock: '0xf4240',
          toBlock: '0xf4240',
          topics: [expect.any(Array), [source.id]],
        },
      ],
    ])
    expect(
      request.mock.calls
        .filter(([{ method }]) => method === 'eth_getBlockByNumber')
        .map(([{ params }]) => params),
    ).toEqual([
      ['latest', false],
      ['0xf4240', false],
    ])
  })

  it('refills a free request slot without waiting for a slow range and bounds parallelism at eight', async () => {
    const gates = Array.from({ length: 10 }, deferred)
    let started = 0
    const { publicClient } = makeClient({
      head: 9_000_000n,
      logs: async () => {
        const gate = gates[started]
        started += 1
        await gate?.promise
        return []
      },
    })
    const read = readV1ResolverHistory({
      sources: [source],
      publicClient,
      chainId: 1,
    })
    try {
      await vi.waitFor(() => expect(started).toBe(8))
      gates[1]?.resolve()
      await vi.waitFor(() => expect(started).toBe(9))
      gates[8]?.resolve()
      await vi.waitFor(() => expect(started).toBe(10))
    } finally {
      for (const gate of gates) gate.resolve()
    }
    expect((await read).isOk()).toBe(true)
  })

  it.each(['abort', 'malformed response', 'RPC failure'] as const)(
    'stops queued ranges after %s and returns an error',
    async (failure) => {
      const gate = deferred()
      const controller = new AbortController()
      const logs = vi.fn(async () => {
        await gate.promise
        if (failure === 'RPC failure') throw new Error('Provider range limit')
        return failure === 'malformed response' ? null : []
      })
      const { publicClient } = makeClient({ head: 19_000_000n, logs })
      const read = readV1ResolverHistory({
        sources: [source],
        publicClient,
        chainId: 1,
        signal: controller.signal,
      })
      await vi.waitFor(() => expect(logs).toHaveBeenCalledTimes(8))
      if (failure === 'abort') controller.abort()
      gate.resolve()
      const result = await read
      expect(result.isErr()).toBe(true)
      expect(logs).toHaveBeenCalledTimes(8)
    },
  )

  it('rejects a reorganized checkpoint even when every range returned successfully', async () => {
    const { publicClient } = makeClient({
      confirmedHash: namehash('changed.eth'),
    })
    const result = await readV1ResolverHistory({
      sources: [source],
      publicClient,
      chainId: 1,
    })
    expect(result._unsafeUnwrapErr().cause).toMatchObject({
      message: 'Resolver history checkpoint changed during the read',
    })
  })

  it('rejects cancellation while the final checkpoint is pending even if transport fulfills', async () => {
    const gate = deferred()
    const controller = new AbortController()
    const request = vi.fn(
      async ({
        method,
        params,
      }: {
        readonly method: string
        readonly params?: readonly unknown[]
      }) => {
        if (method === 'eth_chainId') return '0x1'
        if (method === 'eth_getLogs') return []
        if (params?.[0] !== 'latest') await gate.promise
        return { number: '0x7b', hash: zeroHash }
      },
    )
    const publicClient = createPublicClient({
      transport: custom({ request }, { retryCount: 0 }),
    })
    const read = readV1ResolverHistory({
      sources: [source],
      publicClient,
      chainId: 1,
      signal: controller.signal,
    })
    await vi.waitFor(() =>
      expect(request).toHaveBeenLastCalledWith(
        { method: 'eth_getBlockByNumber', params: ['0x7b', false] },
        { signal: controller.signal },
      ),
    )
    controller.abort()
    gate.resolve()
    expect((await read)._unsafeUnwrapErr().cause).toBe(controller.signal.reason)
  })

  it('rejects another chain before issuing log queries', async () => {
    const logs = vi.fn()
    const { publicClient } = makeClient({ chain: '0xaa36a7', logs })
    expect(
      (
        await readV1ResolverHistory({
          sources: [source],
          publicClient,
          chainId: 1,
        })
      ).isErr(),
    ).toBe(true)
    expect(logs).not.toHaveBeenCalled()
  })

  it('does not contact RPC for an empty selection or an already aborted read', async () => {
    const { publicClient, request } = makeClient()
    expect(
      (
        await readV1ResolverHistory({ sources: [], publicClient, chainId: 1 })
      )._unsafeUnwrap(),
    ).toEqual([])
    expect(
      (
        await readV1ResolverHistory({
          sources: [source],
          publicClient,
          chainId: 1,
          signal: AbortSignal.abort(),
        })
      ).isErr(),
    ).toBe(true)
    expect(request).not.toHaveBeenCalled()
  })
})
