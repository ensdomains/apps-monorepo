import { isLegacyContentPublicResolver } from '@ens-apps/migration'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { type Address, type Hex, zeroAddress, zeroHash } from 'viem'
import { V1_RESOLVER_PROFILE_ABI } from '../contracts/abis'
import type { Profile } from './fetchV1Profiles'

export class LegacyResolverContentError extends TaggedError(
  'LegacyResolverContentError',
)<{ readonly ensName: string }> {}

export class UnsupportedResolverRecordsError extends TaggedError(
  'UnsupportedResolverRecordsError',
)<{ readonly ensName: string; readonly recordType: 'name' | 'dns' }> {}

export type NameForFetch = {
  readonly name: string
  readonly nodeHex: Hex
  readonly v1ResolverAddress: Address
}

export type ProfileKeyEntry = {
  readonly id: string
  readonly texts: readonly string[]
  readonly coinTypes: readonly number[]
  readonly hasContentHash: boolean
  readonly abiContentTypes: readonly bigint[]
  readonly interfaceIds: readonly Hex[]
  readonly hasName?: boolean
}

export type ResolverCall =
  | { readonly name: NameForFetch; readonly kind: 'text'; readonly key: string }
  | {
      readonly name: NameForFetch
      readonly kind: 'addr'
      readonly coinType: bigint
    }
  | { readonly name: NameForFetch; readonly kind: 'contenthash' }
  | {
      readonly name: NameForFetch
      readonly kind: 'abi'
      readonly contentType: bigint
    }
  | {
      readonly name: NameForFetch
      readonly kind: 'interface'
      readonly interfaceId: Hex
    }
  | { readonly name: NameForFetch; readonly kind: 'pubkey' }
  | { readonly name: NameForFetch; readonly kind: 'legacy-content' }
  | { readonly name: NameForFetch; readonly kind: 'name' }

export type MulticallContract = {
  readonly address: Address
  readonly abi: typeof V1_RESOLVER_PROFILE_ABI
  readonly functionName:
    | 'text'
    | 'addr'
    | 'contenthash'
    | 'ABI'
    | 'interfaceImplementer'
    | 'pubkey'
    | 'content'
    | 'name'
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

type SupplementalRecordKind = 'name' | 'legacy-content' | 'pubkey'

// The original ETH getter also works on resolvers predating multicoin.
const addressRecordArgs = (node: Hex, coinType: bigint): readonly unknown[] =>
  coinType === 60n ? [node] : [node, coinType]

const buildSupplementalReads = (
  name: NameForFetch,
  hasName: boolean,
  chainId?: number,
): { calls: ResolverCall[]; contracts: MulticallContract[] } => {
  // Old content is untyped (IPFS or Swarm); pubkeys are not in the inventory.
  const kinds: SupplementalRecordKind[] = [
    ...(hasName ? ['name' as const] : []),
    ...(isLegacyContentPublicResolver(name.v1ResolverAddress, chainId)
      ? ['legacy-content' as const]
      : []),
    'pubkey',
  ]
  return {
    calls: kinds.map((kind) => ({ name, kind })),
    contracts: kinds.map((kind) => ({
      address: name.v1ResolverAddress,
      abi: V1_RESOLVER_PROFILE_ABI,
      functionName: kind === 'legacy-content' ? 'content' : kind,
      args: [name.nodeHex],
    })),
  }
}

export const buildProfileMulticallPlan = (
  keyEntries: readonly ProfileKeyEntry[],
  byNode: ReadonlyMap<Hex, NameForFetch>,
  chainId?: number,
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
        abi: V1_RESOLVER_PROFILE_ABI,
        functionName: 'text',
        args: [name.nodeHex, key],
      })
    }
    for (const ct of entry.coinTypes) {
      const coinType = BigInt(ct)
      calls.push({ name, kind: 'addr', coinType })
      contracts.push({
        address: name.v1ResolverAddress,
        abi: V1_RESOLVER_PROFILE_ABI,
        functionName: 'addr',
        args: addressRecordArgs(name.nodeHex, coinType),
      })
    }
    if (entry.hasContentHash) {
      calls.push({ name, kind: 'contenthash' })
      contracts.push({
        address: name.v1ResolverAddress,
        abi: V1_RESOLVER_PROFILE_ABI,
        functionName: 'contenthash',
        args: [name.nodeHex],
      })
    }
    for (const contentType of new Set(entry.abiContentTypes)) {
      calls.push({ name, kind: 'abi', contentType })
      contracts.push({
        address: name.v1ResolverAddress,
        abi: V1_RESOLVER_PROFILE_ABI,
        functionName: 'ABI',
        args: [name.nodeHex, contentType],
      })
    }
    for (const interfaceId of new Set(entry.interfaceIds)) {
      calls.push({ name, kind: 'interface', interfaceId })
      contracts.push({
        address: name.v1ResolverAddress,
        abi: V1_RESOLVER_PROFILE_ABI,
        functionName: 'interfaceImplementer',
        args: [name.nodeHex, interfaceId],
      })
    }
    const supplemental = buildSupplementalReads(
      name,
      entry.hasName === true,
      chainId,
    )
    calls.push(...supplemental.calls)
    contracts.push(...supplemental.contracts)
  }
  return { calls, contracts }
}

export const initEmptyProfileBuckets = (
  byNode: ReadonlyMap<Hex, NameForFetch>,
): Map<Hex, Profile> => {
  const out = new Map<Hex, Profile>()
  for (const [, name] of byNode) {
    out.set(profileMapKey(name.nodeHex), {
      texts: [],
      addresses: [],
      contentHash: null,
      abis: [],
      interfaces: [],
      pubkey: null,
    })
  }
  return out
}

export const mergeMulticallResultsIntoProfiles = (params: {
  readonly buckets: Map<Hex, Profile>
  readonly calls: readonly ResolverCall[]
  readonly results: readonly MulticallResult[]
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: text and address result handling intentionally share one index-aligned multicall pass.
}): Map<Hex, Profile> => {
  const { buckets, calls, results } = params
  for (const [i, call] of calls.entries()) {
    const res = results[i]
    if (res?.status !== 'success') continue
    const bucket = buckets.get(profileMapKey(call.name.nodeHex))
    if (!bucket) continue
    const nodeKey = profileMapKey(call.name.nodeHex)
    switch (call.kind) {
      case 'text': {
        const value = res.result as string
        if (value) {
          buckets.set(nodeKey, {
            ...bucket,
            texts: [...bucket.texts, { key: call.key, value }],
          })
        }
        break
      }
      case 'addr': {
        const value = res.result as Hex
        if (
          value &&
          value !== '0x' &&
          !(call.coinType === 60n && value === zeroAddress)
        ) {
          buckets.set(nodeKey, {
            ...bucket,
            addresses: [
              ...bucket.addresses,
              { coinType: call.coinType, value },
            ],
          })
        }
        break
      }
      case 'contenthash': {
        const value = res.result as Hex
        if (value && value !== '0x') {
          buckets.set(nodeKey, { ...bucket, contentHash: value })
        }
        break
      }
      case 'abi': {
        const [contentType, value] = res.result as readonly [bigint, Hex]
        if (contentType !== 0n && value && value !== '0x') {
          buckets.set(nodeKey, {
            ...bucket,
            abis: [...bucket.abis, { contentType, value }],
          })
        }
        break
      }
      case 'interface': {
        const implementer = res.result as Address
        if (implementer && implementer !== zeroAddress) {
          buckets.set(nodeKey, {
            ...bucket,
            interfaces: [
              ...bucket.interfaces,
              { interfaceId: call.interfaceId, implementer },
            ],
          })
        }
        break
      }
      case 'legacy-content': {
        if (res.result !== zeroHash) {
          throw new LegacyResolverContentError({ ensName: call.name.name })
        }
        break
      }
      case 'name': {
        if (res.result !== '') {
          throw new UnsupportedResolverRecordsError({
            ensName: call.name.name,
            recordType: 'name',
          })
        }
        break
      }
      case 'pubkey': {
        const [x, y] = res.result as readonly [Hex, Hex]
        if (x !== zeroHash || y !== zeroHash) {
          buckets.set(nodeKey, { ...bucket, pubkey: { x, y } })
        }
        break
      }
    }
  }
  return buckets
}
