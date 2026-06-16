/**
 * Pure ENS owner resolution shared between the React app (useEnsOwner) and the
 * SSR/OG-image worker (worker/ens.ts).
 *
 * Has no wagmi / tanstack-query / neverthrow / React dependencies so it is safe
 * to import into the Cloudflare Workers bundle. Pass any viem Client whose chain
 * has been extended with the ENS contracts (e.g. `extendChainWithEns(sepolia)`).
 */
import type { sepoliaWithEns } from '@ens-apps/indexer/chain'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { getOwner as getOwnerV1 } from '@ensdomains/ensjs/public/v1'
import {
  getNameRegistryAddress,
  getOwner as getOwnerV2,
} from '@ensdomains/ensjs/public/v2'
import { type Address, type Client, type Transport, zeroAddress } from 'viem'

import type { ProtocolVersion } from '@/utils/types'

export type ResolvedEnsOwner = {
  owner: Address
  registryAddress: Address
  protocolVersion: ProtocolVersion
} | null

// A viem Client whose chain carries the ENS contract addresses (sepoliaWithEns).
type EnsResolveClient = Client<Transport, typeof sepoliaWithEns>

/**
 * Resolve the owner of an `.eth` name (or subname) from the V2 registry.
 *
 * Walks down from the `.eth` root to the immediate parent's subregistry, then
 * reads the leaf label's owner. e.g. for `alice.ledgit.eth` look up the
 * subregistry for `ledgit` under `.eth`, then read `alice` from it. For deeper
 * names (`a.b.ledgit.eth`) it walks each intermediate label in turn. Returns
 * `null` if any parent subregistry is missing or the leaf label is unowned.
 */
async function resolveV2EthOwner(
  client: EnsResolveClient,
  labels: string[],
  v2EthRegistry: Address,
): Promise<{ owner: Address; registryAddress: Address } | null> {
  let registryAddress: Address = v2EthRegistry
  // For names deeper than a 2LD, walk down from the .eth root to the
  // immediate parent's subregistry.
  for (let i = labels.length - 2; i >= 1; i--) {
    registryAddress = await getNameRegistryAddress(client, {
      registryAddress,
      label: labels[i],
    })
    if (registryAddress === zeroAddress) return null
  }

  const v2Owner = await getOwnerV2(client, {
    label: labels[0],
    registryAddress,
  })
  if (!v2Owner || v2Owner === zeroAddress) return null
  // registryAddress is the subregistry the leaf actually lives in — callers
  // (roles, resolver, token) key off this exact registry.
  return { owner: v2Owner, registryAddress }
}

/**
 * Resolve the owner of an ENS name across the V2 and V1 registries.
 *
 * V2 is tried first, but only for `.eth` names — the V2 registry is rooted at
 * `.eth`, so traversing it for a non-`.eth` name (e.g. `florin.xyz`) would
 * incorrectly resolve against the `.eth` namespace. Falls back to the V1
 * registry. Returns `null` when the name is unowned in both.
 */
export async function resolveEnsOwner(
  client: EnsResolveClient,
  name: string,
): Promise<ResolvedEnsOwner> {
  const v2EthRegistry = getChainContractAddress({
    chain: client.chain,
    contract: 'ensRegistry',
  })
  const v1EthRegistry = getChainContractAddress({
    chain: client.chain,
    contract: 'ensLegacyRegistry',
  })

  const labels = name.split('.')
  const tld = labels[labels.length - 1]

  if (tld === 'eth' && labels.length >= 2) {
    const v2 = await resolveV2EthOwner(client, labels, v2EthRegistry)
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
      owner: v1Owner.owner,
      registryAddress: v1EthRegistry,
      protocolVersion: 'ENSv1',
    }
  }

  return null
}
