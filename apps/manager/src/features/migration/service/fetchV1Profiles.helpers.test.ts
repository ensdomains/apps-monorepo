import type { Address, Hex } from 'viem'
import { describe, expect, it } from 'vitest'
import {
  buildProfileMulticallPlan,
  indexNamesByNode,
  type NameForFetch,
  type ProfileKeyEntry,
  profileMapKey,
} from './fetchV1Profiles.helpers'

const V1_RESOLVER: Address = '0x000000000000000000000000000000000000d001'
const NODE_A: Hex =
  '0x1111111111111111111111111111111111111111111111111111111111111111'
const NODE_B: Hex =
  '0x2222222222222222222222222222222222222222222222222222222222222222'

const A: NameForFetch = {
  name: 'a.eth',
  nodeHex: NODE_A,
  v1ResolverAddress: V1_RESOLVER,
}
const profileKeys = (
  overrides: Omit<ProfileKeyEntry, 'hasContentHash' | 'abiContentTypes'> &
    Partial<Pick<ProfileKeyEntry, 'hasContentHash' | 'abiContentTypes'>>,
): ProfileKeyEntry => ({
  hasContentHash: false,
  abiContentTypes: [],
  ...overrides,
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
        profileKeys({ id: NODE_A, texts: ['email'], coinTypes: [60] }),
        profileKeys({ id: NODE_B, texts: ['only'], coinTypes: [] }),
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
})
