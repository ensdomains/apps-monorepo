import type { Call } from '@ens-apps/transaction-manager'
import { getNameRegistries } from '@ensdomains/ensjs/public/v2'
import {
  permissionedRegistryGetResolverSnippet,
  permissionedRegistryGetStateSnippet,
  permissionedRegistrySetResolverSnippet,
} from '@ensdomains/ensjs-abi/v2/permissionedRegistry'
import {
  type Address,
  encodeFunctionData,
  labelhash,
  type PublicClient,
  zeroAddress,
} from 'viem'
import { normalize } from 'viem/ens'
import { publicClient } from '@/lib/wagmi'

export class NameRegistryNotFoundError extends Error {
  constructor(name: string) {
    super(`No V2 registry holds ${name}`)
    this.name = 'NameRegistryNotFoundError'
  }
}

/** Where a V2 name's resolver pointer lives: its parent's registry, keyed by its leaf label. */
export type NameRegistryLocation = {
  readonly label: string
  readonly registryAddress: Address
}

/**
 * Locate the registry that holds `name`'s resolver pointer.
 *
 * The UniversalResolver returns the ancestry leaf-first, so index 0 is the
 * name's *own* subregistry (zero for a leaf without children) and index 1 is
 * the registry containing the leaf label — the `.eth` registry for a 2LD, the
 * parent's registry for a subname. `setResolver` must be sent there.
 */
export async function resolveNameRegistry(
  name: string,
  client: PublicClient = publicClient as PublicClient,
): Promise<NameRegistryLocation> {
  const normalized = normalize(name)
  const [label] = normalized.split('.')
  const registries = await getNameRegistries(
    client as unknown as Parameters<typeof getNameRegistries>[0],
    { name: normalized },
  )
  const registryAddress = registries[1]
  if (!label || !registryAddress || registryAddress === zeroAddress) {
    throw new NameRegistryNotFoundError(name)
  }
  return { label, registryAddress }
}

/** Read the V2 entry itself; a cleared V1 registry is never a source fallback. */
export const readNameResolver = async (
  location: NameRegistryLocation,
  client: PublicClient,
): Promise<Address> =>
  client.readContract({
    address: location.registryAddress,
    abi: permissionedRegistryGetResolverSnippet,
    functionName: 'getResolver',
    args: [location.label],
  })

/** A registered V2 entry with no resolver must not fall back to legacy data. */
export const hasV2NameEntry = async (
  location: NameRegistryLocation,
  client: PublicClient,
): Promise<boolean> => {
  const state = await client.readContract({
    address: location.registryAddress,
    abi: permissionedRegistryGetStateSnippet,
    functionName: 'getState',
    args: [BigInt(labelhash(location.label))],
  })
  return state.latestOwner.toLowerCase() !== zeroAddress
}

/**
 * The `setResolver` call for an ENS V2 name, addressed to the registry that
 * holds it (see {@link resolveNameRegistry}).
 *
 * Only the call is built here. Its consumer submits it after the replacement
 * resolver has been deployed and seeded with the requested records.
 */
export function buildSetResolverCall({
  label,
  registryAddress,
  newResolver,
}: NameRegistryLocation & { readonly newResolver: Address }): Call {
  const data = encodeFunctionData({
    abi: permissionedRegistrySetResolverSnippet,
    functionName: 'setResolver',
    args: [BigInt(labelhash(label)), newResolver],
  })

  return { to: registryAddress, data, value: 0n }
}
