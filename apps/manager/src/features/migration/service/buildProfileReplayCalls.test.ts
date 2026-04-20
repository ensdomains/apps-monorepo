import { type Address, decodeFunctionData, type Hex, zeroAddress } from 'viem'
import { describe, expect, it } from 'vitest'
import { PERMISSIONED_RESOLVER_ABI } from '../contracts/abis'
import {
  buildChunkedProfileReplayCalls,
  buildProfileReplayCall,
} from './buildProfileReplayCalls'
import type { Profile } from './fetchV1Profiles'

const RESOLVER: Address = '0x000000000000000000000000000000000000d002'
const NODE: Hex =
  '0x1111111111111111111111111111111111111111111111111111111111111111'

const emptyProfile = (): Profile => ({ texts: [], addresses: [] })

describe('buildProfileReplayCall', () => {
  it('returns null when there are no profiles', () => {
    expect(
      buildProfileReplayCall({ resolver: RESOLVER, profiles: new Map() }),
    ).toBeNull()
  })

  it('returns null when all profiles are empty', () => {
    const profiles = new Map<Hex, Profile>([[NODE, emptyProfile()]])
    expect(buildProfileReplayCall({ resolver: RESOLVER, profiles })).toBeNull()
  })

  it('throws on zero-address resolver', () => {
    expect(() =>
      buildProfileReplayCall({
        resolver: zeroAddress,
        profiles: new Map(),
      }),
    ).toThrow(/zero address/i)
  })

  it('wraps text + addr inner calls in a resolver.multicall(bytes[])', () => {
    const profile: Profile = {
      texts: [{ key: 'email', value: 'a@b.c' }],
      addresses: [
        {
          coinType: 60n,
          value: '0x0000000000000000000000000000000000000abc' as Hex,
        },
      ],
    }
    const call = buildProfileReplayCall({
      resolver: RESOLVER,
      profiles: new Map<Hex, Profile>([[NODE, profile]]),
    })
    expect(call).not.toBeNull()
    expect(call!.to).toBe(RESOLVER)
    expect(call!.value).toBe(0n)

    const { functionName, args } = decodeFunctionData({
      abi: PERMISSIONED_RESOLVER_ABI,
      data: call!.data,
    })
    expect(functionName).toBe('multicall')
    const [innerCalls] = args as [readonly Hex[]]
    expect(innerCalls).toHaveLength(2)

    const setText = decodeFunctionData({
      abi: PERMISSIONED_RESOLVER_ABI,
      data: innerCalls[0]!,
    })
    expect(setText.functionName).toBe('setText')
    expect((setText.args as [Hex, string, string])[1]).toBe('email')

    const setAddr = decodeFunctionData({
      abi: PERMISSIONED_RESOLVER_ABI,
      data: innerCalls[1]!,
    })
    expect(setAddr.functionName).toBe('setAddr')
    expect((setAddr.args as [Hex, bigint, Hex])[1]).toBe(60n)
  })
})

describe('buildChunkedProfileReplayCalls', () => {
  it('returns empty when there are no records', () => {
    const calls = buildChunkedProfileReplayCalls({
      resolver: RESOLVER,
      profiles: new Map(),
    })
    expect(calls).toEqual([])
  })

  it('throws on zero-address resolver', () => {
    expect(() =>
      buildChunkedProfileReplayCalls({
        resolver: zeroAddress,
        profiles: new Map(),
      }),
    ).toThrow(/zero address/i)
  })

  it('emits a single UserOp call when records fit within maxRecordsPerOp', () => {
    const profile: Profile = {
      texts: [
        { key: 'a', value: '1' },
        { key: 'b', value: '2' },
      ],
      addresses: [],
    }
    const calls = buildChunkedProfileReplayCalls({
      resolver: RESOLVER,
      profiles: new Map<Hex, Profile>([[NODE, profile]]),
      maxRecordsPerOp: 10,
    })
    expect(calls).toHaveLength(1)
  })

  it('splits records across multiple UserOp calls when exceeding maxRecordsPerOp', () => {
    const texts = Array.from({ length: 21 }, (_, i) => ({
      key: `k${i}`,
      value: `v${i}`,
    }))
    const calls = buildChunkedProfileReplayCalls({
      resolver: RESOLVER,
      profiles: new Map<Hex, Profile>([[NODE, { texts, addresses: [] }]]),
      maxRecordsPerOp: 10,
    })
    expect(calls).toHaveLength(3)

    const counts = calls.map((call) => {
      const { args } = decodeFunctionData({
        abi: PERMISSIONED_RESOLVER_ABI,
        data: call.data,
      })
      return (args as [readonly Hex[]])[0].length
    })
    expect(counts).toEqual([10, 10, 1])
  })

  it('flattens text + addr records together for chunking', () => {
    const profile: Profile = {
      texts: Array.from({ length: 3 }, (_, i) => ({
        key: `t${i}`,
        value: `v${i}`,
      })),
      addresses: Array.from({ length: 4 }, (_, i) => ({
        coinType: BigInt(i),
        value: `0x${i.toString(16).padStart(40, '0')}` as Hex,
      })),
    }
    const calls = buildChunkedProfileReplayCalls({
      resolver: RESOLVER,
      profiles: new Map<Hex, Profile>([[NODE, profile]]),
      maxRecordsPerOp: 3,
    })
    expect(calls).toHaveLength(3)
  })

  it('defaults maxRecordsPerOp to 50', () => {
    const texts = Array.from({ length: 60 }, (_, i) => ({
      key: `k${i}`,
      value: 'v',
    }))
    const calls = buildChunkedProfileReplayCalls({
      resolver: RESOLVER,
      profiles: new Map<Hex, Profile>([[NODE, { texts, addresses: [] }]]),
    })
    expect(calls).toHaveLength(2)
  })
})
