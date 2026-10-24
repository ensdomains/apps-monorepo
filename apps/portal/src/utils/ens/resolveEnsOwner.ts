/**
 * Pure ENS owner resolution shared between the React app (useEnsOwner) and the
 * SSR/OG-image worker (worker/ens.ts).
 *
 * Has no wagmi / tanstack-query / neverthrow / React dependencies so it is safe
 * to import into the Cloudflare Workers bundle. Pass any viem Client whose chain
 * has been extended with the ENS contracts (e.g. `extendChainWithEns(sepolia)`).
 */
import type { EnsChain } from '@ens-apps/config'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { getOwner as getOwnerV1 } from '@ensdomains/ensjs/public/v1'
import {
  getNameRegistries,
  getOwner as getOwnerV2,
} from '@ensdomains/ensjs/public/v2'
import { nameWrapperGetDataSnippet } from '@ensdomains/ensjs-abi/v1/nameWrapper'
import {
  type Address,
  type Client,
  isAddressEqual,
  namehash,
  type Transport,
  zeroAddress,
} from 'viem'
import { readContract } from 'viem/actions'
import { normalize } from 'viem/ens'
import { getAction } from 'viem/utils'
import { isContractRevert } from '@/utils/errors/isContractRevert'
import type { ProtocolVersion } from '@/utils/types'

export type ResolvedEnsOwner = {
  owner: Address
  registryAddress: Address
  protocolVersion: ProtocolVersion
} | null

// A viem Client whose chain carries the ENS contract addresses.
type EnsResolveClient = Client<Transport, EnsChain>

/**
 * Resolve the owner of an `.eth` name (or subname) from the V2 registry.
 *
 * The UniversalHelper walks the registry tree on-chain, so both the owner and
 * the name's ancestry of registries are read directly by name at any depth,
 * with no manual per-label `getSubregistry` walk. `getOwner` calls
 * `findExactOwner`; `getNameRegistries` calls `findRegistries`, which returns
 * the registries leaf-first:
 * `[registryOf(leaf), registryContaining(leaf), ..., root]`. The registry the
 * leaf label actually lives in (what callers like roles, resolver and token key
 * off) is therefore index 1.
 *
 * Both reads are independent and fired together so the client's batching
 * coalesces them into a single request. Returns `null` if the name is unowned
 * or any ancestor registry along the path is missing or reverts (WEB-1885).
 */
async function resolveV2EthOwner(
  client: EnsResolveClient,
  name: string,
): Promise<{ owner: Address; registryAddress: Address } | null> {
  const reads = await Promise.all([
    getOwnerV2(client, { name }),
    getNameRegistries(client, { name }),
  ]).catch((error: unknown) => {
    if (isContractRevert(error)) return null
    throw error
  })
  if (!reads) return null
  const [v2Owner, registries] = reads

  if (!v2Owner || v2Owner === zeroAddress) return null

  // Index 1 is the registry that contains the leaf label (its parent's
  // subregistry); index 0 is the leaf's *own* subregistry, which is the zero
  // address for a leaf that has no children of its own.
  const registryAddress = registries[1]
  if (!registryAddress || registryAddress === zeroAddress) return null

  return { owner: v2Owner, registryAddress }
}

/**
 * Resolve the owner of an ENS name across the V2 and V1 registries.
 *
 * V2 is tried first, but only for `.eth` names, because DNS names are V1-only:
 * `.eth` is the sole TLD with a subregistry under the V2 root, so a DNS name
 * has no registry containing it and `findOwner` has nothing to walk into.
 * (`getNameRegistries` returns `[0x0, 0x0, root]` for `alice.xyz` versus
 * `[0x0, ethRegistry, root]` for `alice.eth`.) Querying V2 for a DNS name is
 * therefore always a wasted round trip that can only return zero — never a
 * verdict that the name is unowned.
 *
 * Falls back to the V1 registry, which is where both DNS imports and
 * unmigrated `.eth` names live. Returns `null` when the name is unowned there
 * — note that for a DNS name this does NOT mean "does not exist": a gasless
 * (off-chain) DNS name resolves through CCIP with no registry entry at all.
 */
export async function resolveEnsOwner(
  client: EnsResolveClient,
  name: string,
): Promise<ResolvedEnsOwner> {
  const v1EthRegistry = getChainContractAddress({
    chain: client.chain,
    contract: 'ensLegacyRegistry',
  })

  const labels = name.split('.')
  const tld = labels[labels.length - 1]

  if (tld === 'eth' && labels.length >= 2) {
    const v2 = await resolveV2EthOwner(client, name)
    if (v2) {
      return {
        owner: v2.owner,
        registryAddress: v2.registryAddress,
        protocolVersion: 'ENSv2',
      }
    }
  }

  const v1Owner = await getOwnerV1(client, { name })
  if (v1Owner?.owner && v1Owner.owner !== zeroAddress) {
    return {
      owner: await unwrapV1Owner(client, name, v1Owner.owner),
      registryAddress: v1EthRegistry,
      protocolVersion: 'ENSv1',
    }
  }

  return null
}

/**
 * The holder behind a wrapped name, where the registry names the NameWrapper.
 *
 * Normally ensjs reports the wrapper's owner itself, but once the registration
 * lapses the registrar stops naming a registrant and the read falls back to the
 * registry slot, which is the wrapper contract. Left alone, a name in grace
 * reads as owned by a contract and its holder loses every owner-gated action.
 */
async function unwrapV1Owner(
  client: EnsResolveClient,
  name: string,
  owner: Address,
): Promise<Address> {
  const nameWrapper = getChainContractAddress({
    chain: client.chain,
    contract: 'ensNameWrapper',
  })
  if (!isAddressEqual(owner, nameWrapper)) return owner

  const [wrappedOwner] = await getAction(
    client,
    readContract,
    'readContract',
  )({
    address: nameWrapper,
    abi: nameWrapperGetDataSnippet,
    functionName: 'getData',
    args: [BigInt(namehash(normalize(name)))],
  })

  return wrappedOwner && wrappedOwner !== zeroAddress ? wrappedOwner : owner
}
