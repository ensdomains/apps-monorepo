import { type Address, decodeFunctionData, type Hex, zeroAddress } from 'viem'
import { assert, describe, expect, it } from 'vitest'
import { PERMISSIONED_RESOLVER_ABI } from '../contracts/abis'
import { buildProfileReplayCall } from './buildProfileReplayCalls'
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
    assert(call)
    expect(call.to).toBe(RESOLVER)
    expect(call.value).toBe(0n)

    const { functionName, args } = decodeFunctionData({
      abi: PERMISSIONED_RESOLVER_ABI,
      data: call.data,
    })
    expect(functionName).toBe('multicall')
    const [innerCalls] = args as [readonly Hex[]]
    expect(innerCalls).toHaveLength(2)
    const [firstInner, secondInner] = innerCalls
    assert(firstInner && secondInner)

    const setText = decodeFunctionData({
      abi: PERMISSIONED_RESOLVER_ABI,
      data: firstInner,
    })
    expect(setText.functionName).toBe('setText')
    expect((setText.args as [Hex, string, string])[1]).toBe('email')

    const setAddr = decodeFunctionData({
      abi: PERMISSIONED_RESOLVER_ABI,
      data: secondInner,
    })
    expect(setAddr.functionName).toBe('setAddr')
    expect((setAddr.args as [Hex, bigint, Hex])[1]).toBe(60n)
  })
})
