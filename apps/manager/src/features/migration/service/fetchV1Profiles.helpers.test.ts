import type { Address, Hex } from 'viem'
import { describe, expect, it } from 'vitest'
import {
  buildProfileMulticallPlan,
  indexNamesByNode,
  initEmptyProfileBuckets,
  mergeMulticallResultsIntoProfiles,
  type NameForFetch,
  profileMapKey,
} from './fetchV1Profiles.helpers'

const V1_RESOLVER: Address = '0x000000000000000000000000000000000000d001'
const NODE_A: Hex =
  '0x1111111111111111111111111111111111111111111111111111111111111111'
const NODE_B: Hex =
  '0x2222222222222222222222222222222222222222222222222222222222222222'

const A: NameForFetch = { nodeHex: NODE_A, v1ResolverAddress: V1_RESOLVER }
const B: NameForFetch = { nodeHex: NODE_B, v1ResolverAddress: V1_RESOLVER }

describe('profileMapKey', () => {
  it('lowercases and is idempotent', () => {
    expect(profileMapKey('0xABCDEF' as Hex)).toBe('0xabcdef')
    expect(profileMapKey(profileMapKey(NODE_A))).toBe(profileMapKey(NODE_A))
  })
})

describe('indexNamesByNode', () => {
  it('keys entries by lowercased nodeHex', () => {
    const map = indexNamesByNode([
      { ...A, nodeHex: NODE_A.toUpperCase() as Hex },
    ])
    expect(map.get(profileMapKey(NODE_A))).toBeDefined()
  })
})

describe('buildProfileMulticallPlan', () => {
  it('produces one text call + one addr call per key, skipping unknown node ids', () => {
    const byNode = indexNamesByNode([A])
    const { calls, contracts } = buildProfileMulticallPlan(
      [
        { id: NODE_A, texts: ['email'], coinTypes: [60] },
        { id: NODE_B, texts: ['only'], coinTypes: [] },
      ],
      byNode,
    )
    expect(calls).toHaveLength(2)
    expect(contracts).toHaveLength(2)
    expect(calls[0]).toMatchObject({ kind: 'text', key: 'email' })
    expect(calls[1]).toMatchObject({ kind: 'addr', coinType: 60n })
    expect(contracts[0]).toMatchObject({ functionName: 'text' })
    expect(contracts[1]).toMatchObject({ functionName: 'addr' })
  })

  it('matches subgraph rows to names via lowercased node id', () => {
    const byNode = indexNamesByNode([A])
    const { calls } = buildProfileMulticallPlan(
      [{ id: NODE_A.toUpperCase(), texts: ['email'], coinTypes: [] }],
      byNode,
    )
    expect(calls).toHaveLength(1)
  })

  it('returns empty arrays when no keys', () => {
    expect(buildProfileMulticallPlan([], indexNamesByNode([A]))).toEqual({
      calls: [],
      contracts: [],
    })
  })
})

describe('initEmptyProfileBuckets', () => {
  it('creates an empty-profile entry keyed by lowercased nodeHex for each name', () => {
    const buckets = initEmptyProfileBuckets(indexNamesByNode([A, B]))
    expect(buckets.size).toBe(2)
    expect(buckets.get(profileMapKey(NODE_A))).toEqual({
      texts: [],
      addresses: [],
    })
  })
})

describe('mergeMulticallResultsIntoProfiles', () => {
  const byNode = indexNamesByNode([A])

  it('appends text and addr entries on successful results', () => {
    const buckets = initEmptyProfileBuckets(byNode)
    const { calls } = buildProfileMulticallPlan(
      [{ id: NODE_A, texts: ['email'], coinTypes: [60] }],
      byNode,
    )
    const merged = mergeMulticallResultsIntoProfiles({
      buckets,
      calls,
      results: [
        { status: 'success', result: 'a@b.c' },
        {
          status: 'success',
          result: '0x000000000000000000000000000000000000abcd' as Hex,
        },
      ],
    })
    const entry = merged.get(profileMapKey(NODE_A))!
    expect(entry.texts).toEqual([{ key: 'email', value: 'a@b.c' }])
    expect(entry.addresses).toEqual([
      {
        coinType: 60n,
        value: '0x000000000000000000000000000000000000abcd',
      },
    ])
  })

  it('drops empty text values and "0x" addr values', () => {
    const buckets = initEmptyProfileBuckets(byNode)
    const { calls } = buildProfileMulticallPlan(
      [{ id: NODE_A, texts: ['email'], coinTypes: [60] }],
      byNode,
    )
    const merged = mergeMulticallResultsIntoProfiles({
      buckets,
      calls,
      results: [
        { status: 'success', result: '' },
        { status: 'success', result: '0x' as Hex },
      ],
    })
    const entry = merged.get(profileMapKey(NODE_A))!
    expect(entry.texts).toEqual([])
    expect(entry.addresses).toEqual([])
  })

  it('skips failed results', () => {
    const buckets = initEmptyProfileBuckets(byNode)
    const { calls } = buildProfileMulticallPlan(
      [{ id: NODE_A, texts: ['email', 'url'], coinTypes: [] }],
      byNode,
    )
    const merged = mergeMulticallResultsIntoProfiles({
      buckets,
      calls,
      results: [
        { status: 'failure' },
        { status: 'success', result: 'ok-value' },
      ],
    })
    expect(merged.get(profileMapKey(NODE_A))!.texts).toEqual([
      { key: 'url', value: 'ok-value' },
    ])
  })
})
