import type { Call } from '@ens-apps/transaction-manager'
import { type Address, type Hex, zeroAddress } from 'viem'
import {
  MULTICALL_OVERHEAD,
  SETADDR_GAS,
  SETTEXT_GAS,
  TARGET_GAS,
} from './batchMigrate.constants'
import {
  flattenProfileInnerCalls,
  wrapInnerCallsAsMulticall,
} from './buildProfileReplayCalls'
import type { Profile } from './fetchV1Profiles'

export type BuildBatchedProfileReplayParams = {
  readonly resolver: Address
  readonly profiles: ReadonlyMap<Hex, Profile>
  readonly targetGas?: bigint
}

const flattenWithCosts = (
  profiles: ReadonlyMap<Hex, Profile>,
): { call: Hex; cost: bigint }[] => {
  const innerCalls = flattenProfileInnerCalls(profiles)
  const tagged: { call: Hex; cost: bigint }[] = []
  let i = 0
  for (const [, profile] of profiles) {
    for (let t = 0; t < profile.texts.length; t++) {
      tagged.push({ call: innerCalls[i++]!, cost: SETTEXT_GAS })
    }
    for (let a = 0; a < profile.addresses.length; a++) {
      tagged.push({ call: innerCalls[i++]!, cost: SETADDR_GAS })
    }
  }
  return tagged
}

export const buildBatchedProfileReplayCalls = (
  params: BuildBatchedProfileReplayParams,
): readonly Call[] => {
  const { resolver, profiles, targetGas = TARGET_GAS } = params
  if (resolver === zeroAddress) {
    throw new Error(
      'buildBatchedProfileReplayCalls: resolver must not be the zero address',
    )
  }
  if (profiles.size === 0) return []

  const tagged = flattenWithCosts(profiles)
  if (tagged.length === 0) return []

  const calls: Call[] = []
  let current: Hex[] = []
  let currentGas = MULTICALL_OVERHEAD

  for (const { call, cost } of tagged) {
    if (current.length > 0 && currentGas + cost > targetGas) {
      calls.push(wrapInnerCallsAsMulticall(resolver, current))
      current = []
      currentGas = MULTICALL_OVERHEAD
    }
    current.push(call)
    currentGas += cost
  }
  if (current.length > 0)
    calls.push(wrapInnerCallsAsMulticall(resolver, current))

  return calls
}
