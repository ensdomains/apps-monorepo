import type { Erc4337Call } from '@ens-apps/transaction-manager'
import { type Address, encodeFunctionData, type Hex, zeroAddress } from 'viem'
import { PERMISSIONED_RESOLVER_ABI } from '../contracts/abis'
import type { Profile } from './fetchV1Profiles'

export const flattenProfileInnerCalls = (
  profiles: ReadonlyMap<Hex, Profile>,
): Hex[] => {
  const innerCalls: Hex[] = []
  for (const [nodeHex, profile] of profiles) {
    for (const t of profile.texts) {
      innerCalls.push(
        encodeFunctionData({
          abi: PERMISSIONED_RESOLVER_ABI,
          functionName: 'setText',
          args: [nodeHex, t.key, t.value],
        }),
      )
    }
    for (const a of profile.addresses) {
      innerCalls.push(
        encodeFunctionData({
          abi: PERMISSIONED_RESOLVER_ABI,
          functionName: 'setAddr',
          args: [nodeHex, a.coinType, a.value],
        }),
      )
    }
  }
  return innerCalls
}

export const wrapInnerCallsAsMulticall = (
  resolver: Address,
  innerCalls: readonly Hex[],
): Erc4337Call => ({
  to: resolver,
  data: encodeFunctionData({
    abi: PERMISSIONED_RESOLVER_ABI,
    functionName: 'multicall',
    args: [innerCalls as Hex[]],
  }),
  value: 0n,
})

export const buildProfileReplayCall = (params: {
  resolver: Address
  profiles: Map<Hex, Profile>
}): Erc4337Call | null => {
  if (params.resolver === zeroAddress) {
    throw new Error(
      'buildProfileReplayCall: resolver must not be the zero address',
    )
  }
  const inner = flattenProfileInnerCalls(params.profiles)
  if (inner.length === 0) return null
  return wrapInnerCallsAsMulticall(params.resolver, inner)
}
