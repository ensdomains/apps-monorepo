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
  overrides: Pick<ProfileKeyEntry, 'id' | 'texts' | 'coinTypes'> &
    Partial<ProfileKeyEntry>,
): ProfileKeyEntry => ({
  hasContentHash: false,
  abiContentTypes: [],
  interfaceIds: [],
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
  it('produces one text call + one addr call per key, then the pubkey read, skipping unknown node ids', () => {
    const byNode = indexNamesByNode([A])
    const { calls, contracts } = buildProfileMulticallPlan(
      [
        profileKeys({ id: NODE_A, texts: ['email'], coinTypes: [60] }),
        profileKeys({ id: NODE_B, texts: ['only'], coinTypes: [] }),
      ],
      byNode,
    )
    expect(calls).toHaveLength(3)
    expect(contracts).toHaveLength(3)
    expect(calls[0]).toMatchObject({ kind: 'text', key: 'email' })
    expect(calls[1]).toMatchObject({ kind: 'addr', coinType: 60n })
    expect(calls[2]).toMatchObject({ kind: 'pubkey' })
    expect(contracts[0]).toMatchObject({ functionName: 'text' })
    expect(contracts[1]).toMatchObject({ functionName: 'addr' })
    expect(contracts[2]).toMatchObject({ functionName: 'pubkey' })
  })

  it('reads each distinct interface id, then the pubkey', () => {
    const byNode = indexNamesByNode([A])
    const { calls, contracts } = buildProfileMulticallPlan(
      [
        profileKeys({
          id: NODE_A,
          texts: [],
          coinTypes: [],
          interfaceIds: ['0x01ffc9a7', '0x01ffc9a7', '0x12345678'],
        }),
      ],
      byNode,
    )
    expect(calls).toEqual([
      { name: A, kind: 'interface', interfaceId: '0x01ffc9a7' },
      { name: A, kind: 'interface', interfaceId: '0x12345678' },
      { name: A, kind: 'pubkey' },
    ])
    expect(contracts.map(({ functionName }) => functionName)).toEqual([
      'interfaceImplementer',
      'interfaceImplementer',
      'pubkey',
    ])
  })
})
