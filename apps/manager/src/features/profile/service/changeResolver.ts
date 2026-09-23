import type { Call } from '@ens-apps/transaction-manager'
import { getNameRegistries } from '@ensdomains/ensjs/public/v2'
import { permissionedRegistrySetResolverSnippet } from '@ensdomains/ensjs-abi/v2/permissionedRegistry'
import { type Address, encodeFunctionData, labelhash, zeroAddress } from 'viem'
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
): Promise<NameRegistryLocation> {
  const normalized = normalize(name)
  const [label] = normalized.split('.')
  const registries = await getNameRegistries(publicClient, { name: normalized })
  const registryAddress = registries[1]
  if (!label || !registryAddress || registryAddress === zeroAddress) {
    throw new NameRegistryNotFoundError(name)
  }
  return { label, registryAddress }
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
