/**
 * What is actually true on chain about a seeded shape.
 *
 * This is the matrix's rank-1 oracle, and it exists because the alternative is
 * circular. The portal derives a V1 name's ownership through
 * `resolveEnsOwner` → ensjs `getOwner`, which *flattens* the registrant and
 * controller into one `owner` — the flattening that E2E-011 is. An expectation
 * that asked the same code path what the Owner row should show would have
 * agreed with the bug. So every value here is read straight off BaseRegistrar,
 * ENSRegistry and NameWrapper, and nothing in this file imports from the app.
 */

import { FUSES } from '@ens-apps/v1-name-shapes'
import { type Address, labelhash, namehash, parseAbi, zeroAddress } from 'viem'
import {
  V1_BASE_REGISTRAR,
  V1_ENS_REGISTRY,
  V1_NAME_WRAPPER,
} from '../fixtures/makeV1Name.js'
import { publicClient } from '../helpers/anvil-client.js'

const REGISTRAR_ABI = parseAbi([
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function nameExpires(uint256 id) view returns (uint256)',
])
const REGISTRY_ABI = parseAbi([
  'function owner(bytes32 node) view returns (address)',
  'function resolver(bytes32 node) view returns (address)',
])
const WRAPPER_ABI = parseAbi([
  'function getData(uint256 id) view returns (address owner, uint32 fuses, uint64 expiry)',
])

/** The same four classes the shape table uses, derived from chain state. */
export type ObservedWrap = 'unwrapped' | 'wrapped' | 'emancipated' | 'locked'

export type ChainTruth = {
  /** BaseRegistrar ERC-721 holder. Only a `.eth` 2LD has one. */
  readonly registrant: Address | null
  /** ENSRegistry owner — the "manager". For a wrapped name this is the NameWrapper. */
  readonly controller: Address
  /** NameWrapper ERC-1155 holder, or null when the name is not wrapped. */
  readonly wrapperOwner: Address | null
  /** Owner-controlled + parent-controlled fuse bitmap, 0 when unwrapped. */
  readonly fuses: number
  /** Wrapper expiry when wrapped, else the registrar expiry of the 2LD. */
  readonly expiry: bigint
  /** Registrar expiry of the `.eth` 2LD this name sits under (or is). */
  readonly ancestorExpiry: bigint
  /** The resolver on the name's own registry slot, or null. */
  readonly resolver: Address | null
  /** Who holds the immediate parent, by the same rules. Null for a 2LD. */
  readonly parentHolder: Address | null
  readonly parentIsWrapped: boolean
  /** What the chain says this name's wrap class is. */
  readonly wrapClass: ObservedWrap
}

const PARENT_CANNOT_CONTROL = 1 << 16

const nonZero = (address: Address): Address | null =>
  address === zeroAddress ? null : address

const wrapperData = async (name: string) =>
  publicClient.readContract({
    address: V1_NAME_WRAPPER,
    abi: WRAPPER_ABI,
    functionName: 'getData',
    args: [BigInt(namehash(name))],
  })

const registryOwner = (name: string) =>
  publicClient.readContract({
    address: V1_ENS_REGISTRY,
    abi: REGISTRY_ABI,
    functionName: 'owner',
    args: [namehash(name)],
  })

/** `ownerOf` reverts once a registration lapses, which is itself information. */
const registrantOf = async (label: string): Promise<Address | null> =>
  publicClient
    .readContract({
      address: V1_BASE_REGISTRAR,
      abi: REGISTRAR_ABI,
      functionName: 'ownerOf',
      args: [BigInt(labelhash(label))],
    })
    .catch(() => null)

const registrarExpiry = (label: string) =>
  publicClient.readContract({
    address: V1_BASE_REGISTRAR,
    abi: REGISTRAR_ABI,
    functionName: 'nameExpires',
    args: [BigInt(labelhash(label))],
  })

const classify = (
  wrapperOwner: Address | null,
  fuses: number,
): ObservedWrap => {
  if (!wrapperOwner) return 'unwrapped'
  // ens-app-v3's ladder: locked is the stronger claim, so it wins over
  // emancipated even though a locked name has both fuses burned.
  if (fuses & FUSES.CANNOT_UNWRAP) return 'locked'
  if (fuses & PARENT_CANNOT_CONTROL) return 'emancipated'
  return 'wrapped'
}

/**
 * Read every fact the matrix asserts against, for one name.
 *
 * All reads are independent and fired together so the client's batching
 * coalesces them.
 */
export const readChainTruth = async (name: string): Promise<ChainTruth> => {
  const labels = name.split('.')
  const is2LD = labels.length === 2
  const parentName = is2LD ? null : labels.slice(1).join('.')
  const ancestorLabel = labels.at(-2) as string

  const [
    controller,
    [wrapperOwnerRaw, fuses, wrapperExpiry],
    resolver,
    ancestorExpiry,
    registrant,
    parent,
  ] = await Promise.all([
    registryOwner(name),
    wrapperData(name),
    publicClient.readContract({
      address: V1_ENS_REGISTRY,
      abi: REGISTRY_ABI,
      functionName: 'resolver',
      args: [namehash(name)],
    }),
    registrarExpiry(ancestorLabel),
    is2LD ? registrantOf(labels[0] as string) : Promise.resolve(null),
    parentName
      ? Promise.all([registryOwner(parentName), wrapperData(parentName)])
      : Promise.resolve(null),
  ])

  const wrapperOwner = nonZero(wrapperOwnerRaw)
  const parentWrapperOwner = parent ? nonZero(parent[1][0]) : null

  return {
    registrant,
    controller,
    wrapperOwner,
    fuses,
    expiry: wrapperOwner ? wrapperExpiry : ancestorExpiry,
    ancestorExpiry,
    resolver: nonZero(resolver),
    parentHolder: parent ? (parentWrapperOwner ?? nonZero(parent[0])) : null,
    parentIsWrapped: parentWrapperOwner !== null,
    wrapClass: classify(wrapperOwner, fuses),
  }
}
