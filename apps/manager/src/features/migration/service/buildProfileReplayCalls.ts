import type { ZeroDevCall } from '@ens-apps/transaction-manager'
import { type Address, encodeFunctionData, type Hex } from 'viem'
import { PERMISSIONED_RESOLVER_ABI } from '../contracts/abis'
import type { Profile } from './fetchV1Profiles'

export const buildProfileReplayCall = (params: {
  resolver: Address
  profiles: Map<Hex, Profile>
}): ZeroDevCall | null => {
  const { resolver, profiles } = params
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

  if (innerCalls.length === 0) return null

  return {
    to: resolver,
    data: encodeFunctionData({
      abi: PERMISSIONED_RESOLVER_ABI,
      functionName: 'multicall',
      args: [innerCalls],
    }),
    value: 0n,
  }
}
