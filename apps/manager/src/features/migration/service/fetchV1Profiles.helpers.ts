import type { Address, Hex } from 'viem'
import { PERMISSIONED_RESOLVER_ABI } from '../contracts/abis'
import type { Profile } from './fetchV1Profiles'

export type NameForFetch = {
  readonly nodeHex: Hex
  readonly v1ResolverAddress: Address
}

export type ProfileKeyEntry = {
  readonly id: string
  readonly texts: readonly string[]
  readonly coinTypes: readonly number[]
}

export type ResolverCall =
  | { readonly name: NameForFetch; readonly kind: 'text'; readonly key: string }
  | {
      readonly name: NameForFetch
      readonly kind: 'addr'
      readonly coinType: bigint
    }

export type MulticallContract = {
  readonly address: Address
  readonly abi: typeof PERMISSIONED_RESOLVER_ABI
  readonly functionName: 'text' | 'addr'
  readonly args: readonly unknown[]
}

export type MulticallResult = {
  readonly status: 'success' | 'failure'
  readonly result?: unknown
  readonly error?: unknown
}

export const profileMapKey = (nodeHex: Hex): Hex => nodeHex.toLowerCase() as Hex

export const indexNamesByNode = (
  names: readonly NameForFetch[],
): Map<Hex, NameForFetch> =>
  new Map(names.map((n) => [profileMapKey(n.nodeHex), n]))

export const buildProfileMulticallPlan = (
  keyEntries: readonly ProfileKeyEntry[],
  byNode: ReadonlyMap<Hex, NameForFetch>,
): {
  readonly calls: ResolverCall[]
  readonly contracts: MulticallContract[]
} => {
  const calls: ResolverCall[] = []
  const contracts: MulticallContract[] = []

  for (const entry of keyEntries) {
    const name = byNode.get(profileMapKey(entry.id as Hex))
    if (!name) continue
    for (const key of entry.texts) {
      calls.push({ name, kind: 'text', key })
      contracts.push({
        address: name.v1ResolverAddress,
        abi: PERMISSIONED_RESOLVER_ABI,
        functionName: 'text',
        args: [name.nodeHex, key],
      })
    }
    for (const ct of entry.coinTypes) {
      const coinType = BigInt(ct)
      calls.push({ name, kind: 'addr', coinType })
      contracts.push({
        address: name.v1ResolverAddress,
        abi: PERMISSIONED_RESOLVER_ABI,
        functionName: 'addr',
        args: [name.nodeHex, coinType],
      })
    }
  }
  return { calls, contracts }
}

export const initEmptyProfileBuckets = (
  byNode: ReadonlyMap<Hex, NameForFetch>,
): Map<Hex, Profile> => {
  const out = new Map<Hex, Profile>()
  for (const [, name] of byNode) {
    out.set(profileMapKey(name.nodeHex), { texts: [], addresses: [] })
  }
  return out
}

export const mergeMulticallResultsIntoProfiles = (params: {
  readonly buckets: Map<Hex, Profile>
  readonly calls: readonly ResolverCall[]
  readonly results: readonly MulticallResult[]
}): Map<Hex, Profile> => {
  const { buckets, calls, results } = params
  for (const [i, call] of calls.entries()) {
    const res = results[i]
    if (res?.status !== 'success') continue
    const bucket = buckets.get(profileMapKey(call.name.nodeHex))
    if (!bucket) continue
    if (call.kind === 'text') {
      const value = res.result as string
      if (value && value.length > 0) {
        buckets.set(profileMapKey(call.name.nodeHex), {
          ...bucket,
          texts: [...bucket.texts, { key: call.key, value }],
        })
      }
    } else {
      const value = res.result as Hex
      if (value && value !== '0x') {
        buckets.set(profileMapKey(call.name.nodeHex), {
          ...bucket,
          addresses: [...bucket.addresses, { coinType: call.coinType, value }],
        })
      }
    }
  }
  return buckets
}
