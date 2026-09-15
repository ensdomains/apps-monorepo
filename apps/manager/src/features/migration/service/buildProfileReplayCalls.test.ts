import { dnsEncodeName } from '@ensdomains/ensjs/utils/v2'
import { type Address, decodeFunctionData, type Hex } from 'viem'
import { assert, describe, expect, it } from 'vitest'
import { PERMISSIONED_RESOLVER_ABI } from '../contracts/abis'
import {
  flattenProfileInnerCalls,
  wrapInnerCallsAsMulticall,
} from './buildProfileReplayCalls'
import type { Profile } from './fetchV1Profiles'

const RESOLVER: Address = '0x000000000000000000000000000000000000d002'
const NAME = 'replay.eth'

describe('buildProfileReplayCalls helpers', () => {
  it('flattens no calls for empty profiles', () => {
    expect(flattenProfileInnerCalls(new Map())).toEqual([])
    expect(
      flattenProfileInnerCalls(
        new Map<string, Profile>([
          [NAME, { texts: [], addresses: [], contentHash: null, abis: [] }],
        ]),
      ),
    ).toEqual([])
  })

  it('flattens every supported record and wraps them in resolver.multicall(bytes[])', () => {
    const profile: Profile = {
      texts: [{ key: 'email', value: 'a@b.c' }],
      addresses: [
        {
          coinType: 60n,
          value: '0x0000000000000000000000000000000000000abc' as Hex,
        },
      ],
      contentHash: '0xe301' as Hex,
      abis: [{ contentType: 1n, value: '0x5b5d' as Hex }],
    }
    const innerCalls = flattenProfileInnerCalls(
      new Map<string, Profile>([[NAME, profile]]),
    )
    expect(innerCalls).toHaveLength(4)

    const call = wrapInnerCallsAsMulticall(RESOLVER, innerCalls)
    expect(call.to).toBe(RESOLVER)
    expect(call.value).toBe(0n)

    const { functionName, args } = decodeFunctionData({
      abi: PERMISSIONED_RESOLVER_ABI,
      data: call.data,
    })
    expect(functionName).toBe('multicall')
    const [wrappedInnerCalls] = args as [readonly Hex[]]
    expect(wrappedInnerCalls).toEqual(innerCalls)
    const [firstInner, secondInner, thirdInner, fourthInner] = wrappedInnerCalls
    assert(firstInner && secondInner && thirdInner && fourthInner)

    const setText = decodeFunctionData({
      abi: PERMISSIONED_RESOLVER_ABI,
      data: firstInner,
    })
    // Every V2 setter addresses the record by DNS-encoded name, not by node.
    expect(setText.functionName).toBe('setText')
    expect(setText.args as [Hex, string, string]).toEqual([
      dnsEncodeName(NAME),
      'email',
      'a@b.c',
    ])

    const setAddr = decodeFunctionData({
      abi: PERMISSIONED_RESOLVER_ABI,
      data: secondInner,
    })
    expect(setAddr.functionName).toBe('setAddress')
    expect(setAddr.args as [Hex, bigint, Hex]).toEqual([
      dnsEncodeName(NAME),
      60n,
      '0x0000000000000000000000000000000000000abc',
    ])

    const setContenthash = decodeFunctionData({
      abi: PERMISSIONED_RESOLVER_ABI,
      data: thirdInner,
    })
    expect(setContenthash.functionName).toBe('setContenthash')
    expect(setContenthash.args as [Hex, Hex]).toEqual([
      dnsEncodeName(NAME),
      '0xe301',
    ])

    const setAbi = decodeFunctionData({
      abi: PERMISSIONED_RESOLVER_ABI,
      data: fourthInner,
    })
    expect(setAbi.functionName).toBe('setABI')
    expect(setAbi.args as [Hex, bigint, Hex]).toEqual([
      dnsEncodeName(NAME),
      1n,
      '0x5b5d',
    ])
  })
})
