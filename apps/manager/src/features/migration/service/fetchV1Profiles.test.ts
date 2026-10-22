import { err, ok } from 'neverthrow'
import {
  type Address,
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  ContractFunctionZeroDataError,
  type Hex,
  HttpRequestError,
  type PublicClient,
  zeroAddress,
  zeroHash,
} from 'viem'
import { assert, beforeEach, describe, expect, it, vi } from 'vitest'
import { V1_RESOLVER_PROFILE_ABI } from '../contracts/abis'
import { fail as failCall, ok as okCall } from './_fixtures'
import {
  fetchV1Profiles,
  ProfileFetchError,
  profileMapKey,
} from './fetchV1Profiles'
import { getV1ProfileKeys, type V1ProfileKeys } from './v1ProfileKeys'

vi.mock('./v1ProfileKeys', () => ({ getV1ProfileKeys: vi.fn() }))

const getV1ProfileKeysMock = vi.mocked(getV1ProfileKeys)

const V1_RESOLVER: Address = '0x000000000000000000000000000000000000d001'
const NODE_A: Hex =
  '0x1111111111111111111111111111111111111111111111111111111111111111'
const NODE_B: Hex =
  '0x2222222222222222222222222222222222222222222222222222222222222222'

// Every name ends its batch with a pubkey read; this is an unset one.
const NO_PUBKEY = okCall([zeroHash, zeroHash])

const pubkeyFailure = (
  cause: ContractFunctionRevertedError | ContractFunctionZeroDataError,
) => ({
  status: 'failure' as const,
  error: new ContractFunctionExecutionError(cause, {
    abi: V1_RESOLVER_PROFILE_ABI,
    functionName: 'pubkey',
    args: [NODE_A],
  }),
  result: undefined,
})

const PUBKEY_REVERT = pubkeyFailure(
  new ContractFunctionRevertedError({
    abi: V1_RESOLVER_PROFILE_ABI,
    functionName: 'pubkey',
  }),
)

const clientWith = (multicallImpl: (opts: unknown) => unknown): PublicClient =>
  ({ multicall: vi.fn(multicallImpl) }) as unknown as PublicClient

const mockKeys = (
  rows: (Pick<V1ProfileKeys, 'id' | 'texts' | 'coinTypes'> &
    Partial<V1ProfileKeys>)[],
) =>
  getV1ProfileKeysMock.mockReturnValueOnce(
    ok(
      rows.map((row) => ({
        hasContentHash: false,
        abiContentTypes: [],
        interfaceIds: [],
        ...row,
      })),
    ) as never,
  )

const run = (
  names: { name: string; nodeHex: Hex; v1ResolverAddress: Address }[],
  publicClient: PublicClient,
) => fetchV1Profiles({ names, publicClient })

const A = { name: 'a.eth', nodeHex: NODE_A, v1ResolverAddress: V1_RESOLVER }
const B = { name: 'b.eth', nodeHex: NODE_B, v1ResolverAddress: V1_RESOLVER }

beforeEach(() => {
  getV1ProfileKeysMock.mockReset()
})

describe('profileMapKey', () => {
  it('lowercases the hex and is idempotent', () => {
    expect(profileMapKey('0xABCDEF' as Hex)).toBe('0xabcdef')
    expect(profileMapKey(profileMapKey(NODE_A))).toBe(profileMapKey(NODE_A))
  })
})

describe('fetchV1Profiles', () => {
  it('returns empty map without RPC when names is empty', async () => {
    const result = await run(
      [],
      clientWith(() => []),
    )
    expect(result.size).toBe(0)
    expect(getV1ProfileKeysMock).not.toHaveBeenCalled()
  })

  it.each([
    [
      'indexer',
      () =>
        getV1ProfileKeysMock.mockReturnValueOnce(
          ok(undefined).andThen(() => err(new Error('bigname 500'))) as never,
        ),
      clientWith(() => []),
    ],
    [
      'onchain',
      () => mockKeys([{ id: NODE_A, texts: ['email'], coinTypes: [] }]),
      clientWith(() => {
        throw new Error('rpc down')
      }),
    ],
  ])('wraps %s errors in ProfileFetchError', async (phase, setup, client) => {
    setup()
    await expect(run([A], client)).rejects.toSatisfy(
      (e) => e instanceof ProfileFetchError && e.phase === phase,
    )
  })

  it('still reads the pubkey when bigname reports no keys', async () => {
    mockKeys([{ id: NODE_A, texts: [], coinTypes: [] }])
    const result = await run(
      [A],
      clientWith(() => [NO_PUBKEY]),
    )
    expect(result.get(profileMapKey(NODE_A))).toEqual({
      texts: [],
      addresses: [],
      contentHash: null,
      abis: [],
      interfaces: [],
      pubkey: null,
    })
  })

  it('populates text + addr records from multicall results', async () => {
    mockKeys([{ id: NODE_A, texts: ['email'], coinTypes: [60] }])
    const result = await run(
      [A],
      clientWith(() => [
        okCall('a@b.c'),
        okCall('0x000000000000000000000000000000000000abcd' as Hex),
        NO_PUBKEY,
      ]),
    )
    const entry = result.get(profileMapKey(NODE_A))
    assert(entry)
    expect(entry.texts).toEqual([{ key: 'email', value: 'a@b.c' }])
    expect(entry.addresses).toEqual([
      {
        coinType: 60n,
        value: '0x000000000000000000000000000000000000abcd',
      },
    ])
  })

  it('cleans social text records before returning migration profiles', async () => {
    mockKeys([
      {
        id: NODE_A,
        texts: ['vnd.twitter', 'com.github'],
        coinTypes: [],
      },
    ])
    const result = await run(
      [A],
      clientWith(() => [
        okCall('https://mobile.twitter.com/she_256/'),
        okCall('github.com/rainbow-me/rainbow/'),
        NO_PUBKEY,
      ]),
    )

    expect(result.get(profileMapKey(NODE_A))?.texts).toEqual([
      { key: 'com.twitter', value: 'she_256' },
      { key: 'com.github', value: 'rainbow-me' },
    ])
  })

  it('uses supplied profile keys without querying bigname again', async () => {
    const result = await fetchV1Profiles({
      names: [A],
      publicClient: clientWith(() => [okCall('a@b.c'), NO_PUBKEY]),
      profileKeys: [
        {
          id: NODE_A,
          texts: ['email'],
          coinTypes: [],
          hasContentHash: false,
          abiContentTypes: [],
          interfaceIds: [],
        },
      ],
    })

    expect(getV1ProfileKeysMock).not.toHaveBeenCalled()
    expect(result.get(profileMapKey(NODE_A))?.texts).toEqual([
      { key: 'email', value: 'a@b.c' },
    ])
  })

  it('drops empty text values and zero-length addr values', async () => {
    mockKeys([{ id: NODE_A, texts: ['email'], coinTypes: [60] }])
    const result = await run(
      [A],
      clientWith(() => [okCall(''), okCall('0x' as Hex), NO_PUBKEY]),
    )
    const entry = result.get(profileMapKey(NODE_A))
    assert(entry)
    expect(entry.texts).toEqual([])
    expect(entry.addresses).toEqual([])
  })

  it('populates contenthash and ABI bytes while dropping cleared ABI entries', async () => {
    mockKeys([
      {
        id: NODE_A,
        texts: [],
        coinTypes: [],
        hasContentHash: true,
        abiContentTypes: [1n, 2n],
      },
    ])
    const result = await run(
      [A],
      clientWith(() => [
        okCall('0xe301' as Hex),
        okCall([1n, '0x5b5d' as Hex]),
        okCall([0n, '0x' as Hex]),
        NO_PUBKEY,
      ]),
    )

    expect(result.get(profileMapKey(NODE_A))).toEqual({
      texts: [],
      addresses: [],
      contentHash: '0xe301',
      abis: [{ contentType: 1n, value: '0x5b5d' }],
      interfaces: [],
      pubkey: null,
    })
  })

  it('keeps nonzero interface implementers and pubkeys, dropping zero values', async () => {
    const implementer: Address = '0x000000000000000000000000000000000000beef'
    const pubkey = { x: `0x${'aa'.repeat(32)}`, y: zeroHash } as const
    mockKeys([
      {
        id: NODE_A,
        texts: [],
        coinTypes: [],
        interfaceIds: ['0x01ffc9a7', '0x12345678'],
      },
      { id: NODE_B, texts: [], coinTypes: [] },
    ])
    const result = await run(
      [A, B],
      clientWith(() => [
        okCall(implementer),
        okCall(zeroAddress),
        okCall([pubkey.x, pubkey.y]),
        okCall([zeroHash, zeroHash]),
      ]),
    )

    expect(result.get(profileMapKey(NODE_A))).toMatchObject({
      interfaces: [{ interfaceId: '0x01ffc9a7', implementer }],
      pubkey,
    })
    expect(result.get(profileMapKey(NODE_B))?.pubkey).toBeNull()
  })

  it('treats a resolver that reverts on pubkey as holding none', async () => {
    mockKeys([{ id: NODE_A, texts: ['email'], coinTypes: [] }])
    const result = await run(
      [A],
      clientWith(() => [okCall('a@b.c'), PUBKEY_REVERT]),
    )
    expect(result.get(profileMapKey(NODE_A))).toMatchObject({
      texts: [{ key: 'email', value: 'a@b.c' }],
      pubkey: null,
    })
  })

  it('treats a resolver that returns no data for pubkey as holding none', async () => {
    mockKeys([{ id: NODE_A, texts: [], coinTypes: [] }])
    const result = await run(
      [A],
      clientWith(() => [
        pubkeyFailure(
          new ContractFunctionZeroDataError({ functionName: 'pubkey' }),
        ),
      ]),
    )
    expect(result.get(profileMapKey(NODE_A))?.pubkey).toBeNull()
  })

  it('fails closed when the multicall request fails on a pubkey-only chunk', async () => {
    mockKeys([{ id: NODE_A, texts: [], coinTypes: [] }])
    const requestError = new HttpRequestError({ url: 'https://rpc.test' })
    await expect(
      run(
        [A],
        clientWith(() => [
          { status: 'failure', error: requestError, result: undefined },
        ]),
      ),
    ).rejects.toSatisfy(
      (error) =>
        error instanceof ProfileFetchError && error.phase === 'onchain',
    )
  })

  it('fails closed when a pubkey read fails for a reason other than a revert', async () => {
    mockKeys([{ id: NODE_A, texts: ['email'], coinTypes: [] }])
    await expect(
      run(
        [A],
        clientWith(() => [okCall('a@b.c'), failCall()]),
      ),
    ).rejects.toSatisfy(
      (error) =>
        error instanceof ProfileFetchError && error.phase === 'onchain',
    )
  })

  it('fails closed when any multicall record read fails', async () => {
    mockKeys([{ id: NODE_A, texts: ['email', 'url'], coinTypes: [] }])
    await expect(
      run(
        [A],
        clientWith(() => [failCall(), okCall('ok-value'), NO_PUBKEY]),
      ),
    ).rejects.toSatisfy(
      (error) =>
        error instanceof ProfileFetchError && error.phase === 'onchain',
    )
  })

  it('fails closed when multicall returns fewer results than requested', async () => {
    mockKeys([{ id: NODE_A, texts: ['email', 'url'], coinTypes: [] }])
    await expect(
      run(
        [A],
        clientWith(() => [okCall('only-one')]),
      ),
    ).rejects.toSatisfy(
      (error) =>
        error instanceof ProfileFetchError && error.phase === 'onchain',
    )
  })

  it('fails closed when the profile-key inventory omits a requested node', async () => {
    mockKeys([{ id: NODE_A, texts: [], coinTypes: [] }])
    await expect(
      run(
        [A, B],
        clientWith(() => {
          throw new Error('should not be called')
        }),
      ),
    ).rejects.toSatisfy(
      (error) =>
        error instanceof ProfileFetchError && error.phase === 'indexer',
    )
  })

  it('matches indexed entries to names via lowercase node id', async () => {
    mockKeys([{ id: NODE_A.toUpperCase(), texts: ['email'], coinTypes: [] }])
    const result = await run(
      [A],
      clientWith(() => [okCall('matched'), NO_PUBKEY]),
    )
    expect(result.get(profileMapKey(NODE_A))?.texts).toEqual([
      { key: 'email', value: 'matched' },
    ])
  })

  it('chunks multicall args into batches of 700 with batchSize:0', async () => {
    // 700 text reads plus the pubkey read spill one call into a second chunk.
    const keys = Array.from({ length: 700 }, (_, i) => `text-${i}`)
    mockKeys([{ id: NODE_A, texts: keys, coinTypes: [] }])
    const multicallSpy = vi.fn(async (opts: { contracts: unknown[] }) =>
      opts.contracts.map(() => okCall('v')),
    )
    await run([A], { multicall: multicallSpy } as unknown as PublicClient)

    expect(multicallSpy).toHaveBeenCalledTimes(2)
    const [first, second] = multicallSpy.mock.calls.map(
      ([opts]) => opts as { contracts: unknown[]; batchSize?: number },
    )
    expect(first?.batchSize).toBe(0)
    expect(second?.batchSize).toBe(0)
    expect(first?.contracts).toHaveLength(700)
    expect(second?.contracts).toHaveLength(1)
  })

  it('runs chunks with bounded concurrency (>1 in flight, cap respected)', async () => {
    const keys = Array.from({ length: 700 * 8 - 1 }, (_, i) => `text-${i}`)
    mockKeys([{ id: NODE_A, texts: keys, coinTypes: [] }])

    let inFlight = 0
    let maxInFlight = 0
    const multicallSpy = vi.fn(async (opts: { contracts: unknown[] }) => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight--
      return opts.contracts.map(() => okCall('v'))
    })
    await run([A], { multicall: multicallSpy } as unknown as PublicClient)

    expect(multicallSpy).toHaveBeenCalledTimes(8)
    expect(maxInFlight).toBeGreaterThan(1)
    expect(maxInFlight).toBeLessThanOrEqual(6)
  })

  it('populates separate buckets per node', async () => {
    mockKeys([
      { id: NODE_A, texts: ['keyA'], coinTypes: [] },
      { id: NODE_B, texts: ['keyB'], coinTypes: [] },
    ])
    const result = await run(
      [A, B],
      clientWith(() => [okCall('valA'), NO_PUBKEY, okCall('valB'), NO_PUBKEY]),
    )
    expect(result.get(profileMapKey(NODE_A))?.texts[0]).toEqual({
      key: 'keyA',
      value: 'valA',
    })
    expect(result.get(profileMapKey(NODE_B))?.texts[0]).toEqual({
      key: 'keyB',
      value: 'valB',
    })
  })
})
