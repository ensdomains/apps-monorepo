import { createServer } from 'node:http'
import {
  type Address,
  createPublicClient,
  custom,
  encodeAbiParameters,
  encodeFunctionResult,
  multicall3Abi,
  type PublicClient,
  parseAbi,
  zeroAddress,
} from 'viem'
import { mainnet } from 'viem/chains'
import { describe, expect, it, vi } from 'vitest'
import { failover } from '@/lib/rpc'
import {
  createUpgradeReadCoordinator,
  type UpgradeReadClients,
} from './upgradeReadCoordinator'

const OWNER = '0x0000000000000000000000000000000000000001'
const OTHER = '0x0000000000000000000000000000000000000002'
const HASH = `0x${'11'.repeat(32)}`
const REORG = `0x${'22'.repeat(32)}`
const BLOCK = {
  number: '0x1',
  hash: HASH,
  timestamp: '0x3e8',
  transactions: [],
}
const ABI = parseAbi(['function owner() view returns (address)'])
const deferred = <T>() => {
  let resolve = (_value: T): void => undefined
  let reject = (_cause: unknown): void => undefined
  const promise = new Promise<T>((a, b) => {
    resolve = a
    reject = b
  })
  return { promise, resolve, reject }
}
const signal = () => new AbortController().signal
const setup = (
  read: (request: {
    readonly method: string
    readonly params?: readonly unknown[]
  }) => Promise<unknown>,
) => {
  const request = vi.fn(read)
  const base = createPublicClient({
    chain: mainnet,
    transport: custom({ request }, { retryCount: 0 }),
  })
  const coordinator = createUpgradeReadCoordinator({ publicClient: base })
  const run = <T>(
    operation: (clients: UpgradeReadClients) => Promise<T>,
    owner: Address = OWNER,
    runSignal = signal(),
    mode: 'live' | 'after-renewal' = 'live',
  ) => coordinator.run({ owner, signal: runSignal, mode }, operation)
  return { request, base, coordinator, run }
}
const pinned = (client: PublicClient) =>
  client.readContract({
    address: zeroAddress,
    abi: ABI,
    functionName: 'owner',
    blockNumber: 1n,
  })
describe('upgrade read coordinator', () => {
  it('retains actual HTTP array batching for prepared and strict SDK actions', async () => {
    let payloads: readonly unknown[] = []
    const server = createServer(async (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*')
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        })
        res.end()
        return
      }
      let body = ''
      for await (const chunk of req) body += String(chunk)
      const messages: readonly {
        readonly id: number
        readonly method: string
      }[] = JSON.parse(body)
      payloads = [...payloads, messages]
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify(
          messages.map(({ id, method }) => ({
            jsonrpc: '2.0',
            id,
            result: method === 'eth_chainId' ? '0x1' : BLOCK,
          })),
        ),
      )
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('Missing listener')
    const base = createPublicClient({
      chain: mainnet,
      transport: failover([`http://127.0.0.1:${address.port}`]),
      batch: { multicall: { batchSize: 8192, wait: 16 } },
    })
    const coordinator = createUpgradeReadCoordinator({ publicClient: base })
    try {
      const results = await coordinator.run(
        { owner: OWNER, signal: signal() },
        ({ publicClient, verificationClient }) =>
          Promise.all([
            publicClient.request({ method: 'eth_chainId' }),
            publicClient.getBlock(),
            verificationClient.getBlock(),
          ]),
      )
      expect(results[0]).toBe('0x1')
      expect(results[1].number).toBe(1n)
      expect(results[2].number).toBe(1n)
      expect(payloads).toEqual([
        [
          expect.objectContaining({ method: 'eth_chainId' }),
          expect.objectContaining({
            method: 'eth_getBlockByNumber',
            params: ['latest', false],
          }),
          expect.objectContaining({
            method: 'eth_getBlockByNumber',
            params: ['latest', false],
          }),
        ],
      ])
    } finally {
      coordinator.dispose()
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    }
  })

  it('shares raw and bound header reads only while pending', async () => {
    const pending = deferred<typeof BLOCK>()
    const context = setup(async () => pending.promise)
    await context.run(async ({ publicClient }) => {
      const first = publicClient.request({
        method: 'eth_getBlockByNumber',
        params: ['latest', false],
      })
      const second = publicClient.getBlock()
      pending.resolve(BLOCK)
      const [raw, formatted] = await Promise.all([first, second])
      expect(raw).toEqual(BLOCK)
      expect(formatted.number).toBe(1n)
      expect(context.request).toHaveBeenCalledTimes(1)
      await publicClient.getBlock()
      expect(context.request).toHaveBeenCalledTimes(2)
    })
  })
  it('reuses pinned contract and multicall results through real bound actions', async () => {
    const context = setup(async ({ method }) =>
      method === 'eth_getBlockByNumber'
        ? BLOCK
        : encodeAbiParameters([{ type: 'address' }], [OWNER]),
    )
    await context.run(async ({ publicClient }) => {
      await publicClient.getBlock({ blockNumber: 1n })
      expect(await pinned(publicClient)).toBe(OWNER)
      expect(await pinned(publicClient)).toBe(OWNER)
    })
    expect(context.request.mock.calls.map(([call]) => call.method)).toEqual([
      'eth_getBlockByNumber',
      'eth_call',
    ])
    const calls = setup(async ({ method }) =>
      method === 'eth_getBlockByNumber'
        ? BLOCK
        : encodeFunctionResult({
            abi: multicall3Abi,
            functionName: 'aggregate3',
            result: [
              {
                success: true,
                returnData: encodeAbiParameters([{ type: 'address' }], [OWNER]),
              },
            ],
          }),
    )
    await calls.run(async ({ publicClient }) => {
      await publicClient.getBlock({ blockNumber: 1n })
      const read = () =>
        publicClient.multicall({
          multicallAddress: zeroAddress,
          blockNumber: 1n,
          contracts: [
            { address: zeroAddress, abi: ABI, functionName: 'owner' },
          ],
        })
      expect(await read()).toEqual([{ status: 'success', result: OWNER }])
      expect(await read()).toEqual([{ status: 'success', result: OWNER }])
    })
    expect(calls.request).toHaveBeenCalledTimes(2)
  })
  it('never shares verification headers or latest contract calls including pending ones', async () => {
    const pending = deferred<typeof BLOCK>()
    const context = setup(async ({ method }) =>
      method === 'eth_getBlockByNumber'
        ? pending.promise
        : encodeAbiParameters([{ type: 'address' }], [OWNER]),
    )
    await context.run(async ({ publicClient, verificationClient }) => {
      const prepared = publicClient.getBlock({ blockNumber: 1n })
      const verified = verificationClient.getBlock({ blockNumber: 1n })
      pending.resolve(BLOCK)
      await Promise.all([prepared, verified])
      await verificationClient.getBlock({ blockNumber: 1n })
      expect(context.request).toHaveBeenCalledTimes(3)
      const read = () =>
        publicClient.readContract({
          address: zeroAddress,
          abi: ABI,
          functionName: 'owner',
        })
      expect(await Promise.all([read(), read()])).toEqual([OWNER, OWNER])
      expect(context.request).toHaveBeenCalledTimes(5)
    })
  })
  it('invalidates completed reads when fresh headers observe a reorg', async () => {
    let hash = HASH
    let owner: Address = OWNER
    const context = setup(async ({ method }) =>
      method === 'eth_getBlockByNumber'
        ? { ...BLOCK, hash }
        : encodeAbiParameters([{ type: 'address' }], [owner]),
    )
    await context.run(async ({ publicClient, verificationClient }) => {
      await publicClient.getBlock({ blockNumber: 1n })
      expect(await pinned(publicClient)).toBe(OWNER)
      hash = REORG
      owner = OTHER
      await verificationClient.getBlock({ blockNumber: 1n })
      expect(await pinned(publicClient)).toBe(OTHER)
    })
    expect(context.request).toHaveBeenCalledTimes(4)
  })
  it('does not let an older pending header overwrite a later reorg observation', async () => {
    const pending = deferred<typeof BLOCK>()
    let headers = 0
    let owner: Address = OWNER
    const context = setup(async ({ method }) => {
      if (method === 'eth_getBlockByNumber') {
        headers += 1
        return headers === 2
          ? pending.promise
          : { ...BLOCK, hash: headers >= 3 ? REORG : HASH }
      }
      return encodeAbiParameters([{ type: 'address' }], [owner])
    })
    await context.run(async ({ publicClient, verificationClient }) => {
      await publicClient.getBlock()
      expect(await pinned(publicClient)).toBe(OWNER)
      const older = publicClient.getBlock()
      owner = OTHER
      await verificationClient.getBlock()
      expect(await pinned(publicClient)).toBe(OTHER)
      pending.resolve(BLOCK)
      await older
      expect(await pinned(publicClient)).toBe(OTHER)
    })
    expect(
      context.request.mock.calls.filter(([call]) => call.method === 'eth_call'),
    ).toHaveLength(3)
  })

  it('invalidates old closed-range reuse when the latest head advances', async () => {
    let head = BLOCK
    const context = setup(async ({ method }) =>
      method === 'eth_getBlockByNumber' ? head : [],
    )
    const read = ({ publicClient }: UpgradeReadClients) =>
      publicClient.getBlock().then(() =>
        publicClient.request({
          method: 'eth_getLogs',
          params: [{ fromBlock: '0x0', toBlock: '0x1' }],
        }),
      )
    await context.run(read)
    await context.run(read)
    expect(
      context.request.mock.calls.filter(
        ([call]) => call.method === 'eth_getLogs',
      ),
    ).toHaveLength(1)
    head = { ...BLOCK, number: '0x2', hash: REORG }
    await context.run(read)
    expect(
      context.request.mock.calls.filter(
        ([call]) => call.method === 'eth_getLogs',
      ),
    ).toHaveLength(2)
  })

  it('invalidates old range evidence when a delayed latest response follows an exact-header check', async () => {
    const pending = deferred<typeof BLOCK>()
    const changed = { ...BLOCK, number: '0x2', hash: REORG }
    let latestReads = 0
    let logReads = 0
    const context = setup(async ({ method, params }) => {
      if (method === 'eth_getBlockByNumber') {
        if (params?.[0] === 'latest') {
          latestReads += 1
          return latestReads === 1 ? BLOCK : pending.promise
        }
        return params?.[0] === '0x1' ? BLOCK : changed
      }
      if (method === 'eth_getLogs') {
        logReads += 1
        return [
          {
            address: zeroAddress,
            blockNumber: '0x1',
            blockHash: logReads === 1 ? HASH : REORG,
            transactionHash: HASH,
            logIndex: '0x0',
            topics: [],
            data: '0x',
            removed: false,
          },
        ]
      }
      throw new Error(`Unexpected method ${method}`)
    })
    const logs = (client: PublicClient) =>
      client.request({
        method: 'eth_getLogs',
        params: [{ fromBlock: '0x0', toBlock: '0x1' }],
      })
    await context.run(async ({ publicClient }) => {
      await publicClient.getBlock()
      expect((await logs(publicClient))[0]?.blockHash).toBe(HASH)
    })
    await context.run(async ({ publicClient, verificationClient }) => {
      const latest = publicClient.getBlock()
      await verificationClient.getBlock({ blockNumber: 1n })
      pending.resolve(changed)
      const checkpoint = await latest
      expect((await logs(publicClient))[0]?.blockHash).toBe(REORG)
      const confirmed = await verificationClient.getBlock({
        blockNumber: checkpoint.number,
      })
      expect(confirmed.hash).toBe(checkpoint.hash)
    })
    expect(logReads).toBe(2)
  })

  it('lets one subscriber cancel while another receives a shared read', async () => {
    const pending = deferred<typeof BLOCK>()
    const context = setup(async () => pending.promise)
    const cancelled = new AbortController()
    const first = context
      .run(
        ({ publicClient }) => publicClient.getBlock(),
        OWNER,
        cancelled.signal,
      )
      .catch((cause: unknown) => cause)
    const second = context.run(({ publicClient }) => publicClient.getBlock())
    await vi.waitFor(() => expect(context.request).toHaveBeenCalledTimes(1))
    cancelled.abort(new Error('Cancelled first subscriber'))
    const stopped = first.then((value) =>
      expect(value).toMatchObject({ message: 'Cancelled first subscriber' }),
    )
    pending.resolve(BLOCK)
    await stopped
    expect((await second).number).toBe(1n)
    expect(context.request).toHaveBeenCalledTimes(1)
  })
  it('clears disposed work and permits later setup without reviving aborted callers', async () => {
    const pending = deferred<typeof BLOCK>()
    const context = setup(async () => pending.promise)
    const first = context
      .run(({ publicClient }) => publicClient.getBlock())
      .catch((cause: unknown) => cause)
    await vi.waitFor(() => expect(context.request).toHaveBeenCalledTimes(1))
    context.coordinator.dispose()
    pending.resolve(BLOCK)
    expect(await first).toBeInstanceOf(Error)
    const aborted = new AbortController()
    aborted.abort(new Error('Already cancelled'))
    await expect(
      context.run(
        ({ publicClient }) => publicClient.getBlock(),
        OWNER,
        aborted.signal,
      ),
    ).rejects.toThrow('Already cancelled')
    expect(
      (await context.run(({ publicClient }) => publicClient.getBlock())).number,
    ).toBe(1n)
    expect(context.request).toHaveBeenCalledTimes(2)
  })
  it('keeps owner and renewal projection results isolated', async () => {
    const context = setup(async ({ method }) =>
      method === 'eth_getBlockByNumber'
        ? BLOCK
        : encodeAbiParameters([{ type: 'address' }], [OWNER]),
    )
    const read = ({ publicClient }: UpgradeReadClients) =>
      publicClient
        .getBlock({ blockNumber: 1n })
        .then(() => pinned(publicClient))
    await context.run(read)
    await context.run(read, OTHER)
    await context.run(read, OWNER, signal(), 'after-renewal')
    expect(
      context.request.mock.calls.filter(([call]) => call.method === 'eth_call'),
    ).toHaveLength(3)
    await context.run(read)
    expect(
      context.request.mock.calls.filter(([call]) => call.method === 'eth_call'),
    ).toHaveLength(3)
  })
  it('evicts failed shared work before a subsequent read recovers', async () => {
    const failed = deferred<typeof BLOCK>()
    let attempts = 0
    const context = setup(async () => {
      attempts += 1
      return attempts === 1 ? failed.promise : BLOCK
    })
    await context.run(async ({ publicClient }) => {
      const pending = Promise.allSettled([
        publicClient.getBlock(),
        publicClient.getBlock(),
      ])
      failed.reject(new Error('Temporarily unavailable'))
      expect((await pending).map(({ status }) => status)).toEqual([
        'rejected',
        'rejected',
      ])
      expect((await publicClient.getBlock()).number).toBe(1n)
    })
    expect(context.request).toHaveBeenCalledTimes(2)
  })

  it('clones shared responses so callers cannot mutate another reader result', async () => {
    const response = deferred<typeof BLOCK>()
    const context = setup(async () => response.promise)
    await context.run(async ({ publicClient }) => {
      const raw = () =>
        publicClient.request({
          method: 'eth_getBlockByNumber',
          params: ['latest', false],
        })
      const pending = Promise.all([raw(), raw()])
      response.resolve(BLOCK)
      const [first, second] = await pending
      expect(first).toEqual(second)
      expect(first).not.toBe(second)
      expect(first?.transactions).not.toBe(second?.transactions)
    })
    expect(context.request).toHaveBeenCalledTimes(1)
  })

  it('cancels orphaned producer work after its operation rejects', async () => {
    const response = deferred<typeof BLOCK>()
    let upstream: AbortSignal | undefined
    const provider = vi.fn(
      async (
        { method }: { readonly method: string },
        options?: { readonly signal?: AbortSignal },
      ) => {
        if (method === 'eth_getBlockByNumber') {
          upstream = options?.signal
          return response.promise
        }
        throw new Error('Fatal producer failure')
      },
    )
    const base = createPublicClient({
      chain: mainnet,
      transport: custom({ request: provider }, { retryCount: 0 }),
    })
    const coordinator = createUpgradeReadCoordinator({ publicClient: base })
    await expect(
      coordinator.run({ owner: OWNER, signal: signal() }, ({ publicClient }) =>
        Promise.all([
          publicClient.getBlock(),
          publicClient.request({ method: 'eth_gasPrice' }),
        ]),
      ),
    ).rejects.toThrow('Fatal producer failure')
    expect(upstream?.aborted).toBe(true)
    response.resolve(BLOCK)
    expect(
      (
        await coordinator.run(
          { owner: OWNER, signal: signal() },
          ({ publicClient }) => publicClient.getBlock(),
        )
      ).number,
    ).toBe(1n)
    expect(
      provider.mock.calls.filter(
        ([call]) => call.method === 'eth_getBlockByNumber',
      ),
    ).toHaveLength(2)
  })

  it('rejects mutation methods before they reach the provider', async () => {
    const context = setup(async () => null)
    await expect(
      context.run(({ publicClient }) =>
        publicClient.request({
          method: 'eth_sendRawTransaction',
          params: ['0x01'],
        }),
      ),
    ).rejects.toThrow()
    expect(context.request).not.toHaveBeenCalled()
  })
})
