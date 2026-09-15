import type { Call } from '@ens-apps/transaction-manager'
import { dnsEncodeName } from '@ensdomains/ensjs/utils/v2'
import { type Address, encodeFunctionData, type Hex } from 'viem'
import { PERMISSIONED_RESOLVER_ABI } from '../contracts/abis'
import type { Profile } from './fetchV1Profiles'

/**
 * Encode the V1 profile of each name as V2 resolver setter calls.
 *
 * Keyed by the dotted name, not the node: every `PermissionedResolver` setter
 * takes the DNS-encoded name and derives the record from it. Passing a namehash
 * hits the resolver's fallback and reverts with empty data.
 */
export const flattenProfileInnerCalls = (
  profiles: ReadonlyMap<string, Profile>,
): Hex[] => {
  const innerCalls: Hex[] = []
  for (const [name, profile] of profiles) {
    const encodedName = dnsEncodeName(name)
    for (const t of profile.texts) {
      innerCalls.push(
        encodeFunctionData({
          abi: PERMISSIONED_RESOLVER_ABI,
          functionName: 'setText',
          args: [encodedName, t.key, t.value],
        }),
      )
    }
    for (const a of profile.addresses) {
      innerCalls.push(
        encodeFunctionData({
          abi: PERMISSIONED_RESOLVER_ABI,
          functionName: 'setAddress',
          args: [encodedName, a.coinType, a.value],
        }),
      )
    }
    if (profile.contentHash) {
      innerCalls.push(
        encodeFunctionData({
          abi: PERMISSIONED_RESOLVER_ABI,
          functionName: 'setContenthash',
          args: [encodedName, profile.contentHash],
        }),
      )
    }
    for (const abiRecord of profile.abis) {
      innerCalls.push(
        encodeFunctionData({
          abi: PERMISSIONED_RESOLVER_ABI,
          functionName: 'setABI',
          args: [encodedName, abiRecord.contentType, abiRecord.value],
        }),
      )
    }
  }
  return innerCalls
}

export const wrapInnerCallsAsMulticall = (
  resolver: Address,
  innerCalls: readonly Hex[],
): Call => ({
  to: resolver,
  data: encodeFunctionData({
    abi: PERMISSIONED_RESOLVER_ABI,
    functionName: 'multicall',
    args: [innerCalls as Hex[]],
  }),
  value: 0n,
})
