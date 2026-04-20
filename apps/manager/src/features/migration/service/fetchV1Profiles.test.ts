import { err, ok } from 'neverthrow'
import type { Address, Hex, PublicClient } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchV1Profiles,
  ProfileFetchError,
  profileMapKey,
} from './fetchV1Profiles'
import { getV1ProfileKeys } from './v1SubgraphClient'

vi.mock('./v1SubgraphClient', () => ({
  getV1ProfileKeys: vi.fn(),
}))

const getV1ProfileKeysMock = vi.mocked(getV1ProfileKeys)

const V1_RESOLVER: Address = '0x000000000000000000000000000000000000d001'
const NODE_A: Hex =
  '0x1111111111111111111111111111111111111111111111111111111111111111'
const NODE_B: Hex =
  '0x2222222222222222222222222222222222222222222222222222222222222222'

const makeClient = (multicallImpl: (opts: unknown) => unknown): PublicClient =>
  ({ multicall: vi.fn(multicallImpl) }) as unknown as PublicClient

const call = {
  ok: <T>(result: T) => ({ status: 'success' as const, result }),
  fail: () => ({
    status: 'failure' as const,
    error: new Error('reverted'),
    result: undefined,
  }),
}

beforeEach(() => {
  getV1ProfileKeysMock.mockReset()
})

describe('profileMapKey', () => {
  it('lowercases the hex', () => {
    expect(profileMapKey('0xABCDEF' as Hex)).toBe('0xabcdef')
  })

  it('is idempotent', () => {
    const once = profileMapKey(NODE_A)
    const twice = profileMapKey(once)
    expect(twice).toBe(once)
  })
})

describe('fetchV1Profiles', () => {
  it('returns empty map without RPC when names is empty', async () => {
    const publicClient = makeClient(() => [])
    const result = await fetchV1Profiles({ names: [], publicClient })
    expect(result.size).toBe(0)
    expect(getV1ProfileKeysMock).not.toHaveBeenCalled()
  })

  it('wraps subgraph errors in ProfileFetchError with phase="subgraph"', async () => {
    getV1ProfileKeysMock.mockReturnValueOnce(
      ok(undefined).andThen(() => err(new Error('subgraph 500'))) as never,
    )
    const publicClient = makeClient(() => [])

    await expect(
      fetchV1Profiles({
        names: [{ nodeHex: NODE_A, v1ResolverAddress: V1_RESOLVER }],
        publicClient,
      }),
    ).rejects.toBeInstanceOf(ProfileFetchError)
  })

  it('wraps onchain multicall rejections in ProfileFetchError with phase="onchain"', async () => {
    getV1ProfileKeysMock.mockReturnValueOnce(
      ok([{ id: NODE_A, texts: ['email'], coinTypes: [] }]) as never,
    )
    const publicClient = makeClient(() => {
      throw new Error('rpc down')
    })

    await expect(
      fetchV1Profiles({
        names: [{ nodeHex: NODE_A, v1ResolverAddress: V1_RESOLVER }],
        publicClient,
      }),
    ).rejects.toSatisfy(
      (e) => e instanceof ProfileFetchError && e.phase === 'onchain',
    )
  })

  it('returns empty-profile entries when subgraph reports no keys', async () => {
    getV1ProfileKeysMock.mockReturnValueOnce(
      ok([{ id: NODE_A, texts: [], coinTypes: [] }]) as never,
    )
    const publicClient = makeClient(() => {
      throw new Error('should not be called')
    })

    const result = await fetchV1Profiles({
      names: [{ nodeHex: NODE_A, v1ResolverAddress: V1_RESOLVER }],
      publicClient,
    })

    expect(result.get(profileMapKey(NODE_A))).toEqual({
      texts: [],
      addresses: [],
    })
  })

  it('populates text + addr records from multicall results', async () => {
    getV1ProfileKeysMock.mockReturnValueOnce(
      ok([{ id: NODE_A, texts: ['email'], coinTypes: [60] }]) as never,
    )
    const publicClient = makeClient(() => [
      call.ok('a@b.c'),
      call.ok('0x000000000000000000000000000000000000abcd' as Hex),
    ])

    const result = await fetchV1Profiles({
      names: [{ nodeHex: NODE_A, v1ResolverAddress: V1_RESOLVER }],
      publicClient,
    })

    const entry = result.get(profileMapKey(NODE_A))!
    expect(entry.texts).toEqual([{ key: 'email', value: 'a@b.c' }])
    expect(entry.addresses).toEqual([
      {
        coinType: 60n,
        value: '0x000000000000000000000000000000000000abcd',
      },
    ])
  })

  it('drops empty text values and zero-length addr values', async () => {
    getV1ProfileKeysMock.mockReturnValueOnce(
      ok([{ id: NODE_A, texts: ['email'], coinTypes: [60] }]) as never,
    )
    const publicClient = makeClient(() => [call.ok(''), call.ok('0x' as Hex)])

    const result = await fetchV1Profiles({
      names: [{ nodeHex: NODE_A, v1ResolverAddress: V1_RESOLVER }],
      publicClient,
    })

    const entry = result.get(profileMapKey(NODE_A))!
    expect(entry.texts).toEqual([])
    expect(entry.addresses).toEqual([])
  })

  it('skips entries with failed multicall status without populating the bucket', async () => {
    getV1ProfileKeysMock.mockReturnValueOnce(
      ok([{ id: NODE_A, texts: ['email', 'url'], coinTypes: [] }]) as never,
    )
    const publicClient = makeClient(() => [call.fail(), call.ok('ok-value')])

    const result = await fetchV1Profiles({
      names: [{ nodeHex: NODE_A, v1ResolverAddress: V1_RESOLVER }],
      publicClient,
    })

    expect(result.get(profileMapKey(NODE_A))!.texts).toEqual([
      { key: 'url', value: 'ok-value' },
    ])
  })

  it('matches subgraph entries to names via lowercase node id', async () => {
    getV1ProfileKeysMock.mockReturnValueOnce(
      ok([
        { id: NODE_A.toUpperCase(), texts: ['email'], coinTypes: [] },
      ]) as never,
    )
    const publicClient = makeClient(() => [call.ok('matched')])

    const result = await fetchV1Profiles({
      names: [{ nodeHex: NODE_A, v1ResolverAddress: V1_RESOLVER }],
      publicClient,
    })

    expect(result.get(profileMapKey(NODE_A))!.texts).toEqual([
      { key: 'email', value: 'matched' },
    ])
  })

  it('chunks multicall args into batches of 500 to avoid RPC payload limits', async () => {
    const keys = Array.from({ length: 501 }, (_, i) => `text-${i}`)
    getV1ProfileKeysMock.mockReturnValueOnce(
      ok([{ id: NODE_A, texts: keys, coinTypes: [] }]) as never,
    )
    const multicallSpy = vi.fn(async (opts: { contracts: unknown[] }) =>
      opts.contracts.map(() => call.ok('v')),
    )
    const publicClient = {
      multicall: multicallSpy,
    } as unknown as PublicClient

    await fetchV1Profiles({
      names: [{ nodeHex: NODE_A, v1ResolverAddress: V1_RESOLVER }],
      publicClient,
    })

    expect(multicallSpy).toHaveBeenCalledTimes(2)
    expect(
      (multicallSpy.mock.calls[0]![0] as { contracts: unknown[] }).contracts,
    ).toHaveLength(500)
    expect(
      (multicallSpy.mock.calls[1]![0] as { contracts: unknown[] }).contracts,
    ).toHaveLength(1)
  })

  it('populates separate buckets per node', async () => {
    getV1ProfileKeysMock.mockReturnValueOnce(
      ok([
        { id: NODE_A, texts: ['keyA'], coinTypes: [] },
        { id: NODE_B, texts: ['keyB'], coinTypes: [] },
      ]) as never,
    )
    const publicClient = makeClient(() => [call.ok('valA'), call.ok('valB')])

    const result = await fetchV1Profiles({
      names: [
        { nodeHex: NODE_A, v1ResolverAddress: V1_RESOLVER },
        { nodeHex: NODE_B, v1ResolverAddress: V1_RESOLVER },
      ],
      publicClient,
    })

    expect(result.get(profileMapKey(NODE_A))!.texts[0]).toEqual({
      key: 'keyA',
      value: 'valA',
    })
    expect(result.get(profileMapKey(NODE_B))!.texts[0]).toEqual({
      key: 'keyB',
      value: 'valB',
    })
  })
})
