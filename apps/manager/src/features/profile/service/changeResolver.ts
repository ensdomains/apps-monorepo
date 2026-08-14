import { type Call, ENS_SEPOLIA_CONTRACTS } from '@ens-apps/transaction-manager'
import {
  permissionedRegistryGetSubregistrySnippet,
  permissionedRegistrySetResolverSnippet,
} from '@ensdomains/ensjs-abi/v2/permissionedRegistry'
import {
  type Address,
  encodeFunctionData,
  isAddressEqual,
  labelhash,
  type PublicClient,
  zeroAddress,
} from 'viem'
import { normalize } from 'viem/ens'

export interface NameRegistryTarget {
  readonly isSubname: boolean
  readonly label: string
  readonly registryAddress: Address
}

/**
 * Resolve the registry that directly contains `name` and the leaf label used
 * by that registry. A 2LD lives directly in ETHRegistry; each additional label
 * is reached by following the attached subregistry from root to leaf.
 */
export async function resolveNameRegistryTarget({
  name,
  publicClient,
}: {
  readonly name: string
  readonly publicClient: PublicClient
}): Promise<NameRegistryTarget> {
  const fullName = normalize(name.endsWith('.eth') ? name : `${name}.eth`)
  const labels = fullName.split('.')

  if (labels.length < 2 || labels.at(-1) !== 'eth') {
    throw new Error(`Cannot resolve the ENSv2 registry for ${name}`)
  }

  const label = labels[0]
  if (!label) {
    throw new Error(`Cannot resolve the ENSv2 label for ${name}`)
  }
  const parentLabels = labels.slice(1, -1).reverse()
  let registryAddress: Address = ENS_SEPOLIA_CONTRACTS.ETHRegistry

  for (const parentLabel of parentLabels) {
    const subregistry = await publicClient.readContract({
      address: registryAddress,
      abi: permissionedRegistryGetSubregistrySnippet,
      functionName: 'getSubregistry',
      args: [parentLabel],
    })

    if (isAddressEqual(subregistry, zeroAddress)) {
      throw new Error(`Cannot find the parent registry for ${fullName}`)
    }

    registryAddress = subregistry
  }

  return {
    isSubname: labels.length > 2,
    label,
    registryAddress,
  }
}

/**
 * The `setResolver` call for an ENS V2 name.
 *
 * Only the call is built here, never submitted: its one consumer
 * (`setupControlledResolver`) batches it with a resolver deployment and a
 * record write into a single intent. The standalone `changeResolver` submitter
 * that used to live alongside this had no callers and is gone.
 */
export function buildSetResolverCall({
  label,
  newResolver,
  registryAddress,
}: {
  label: string
  newResolver: Address
  registryAddress: Address
}): Call {
  const data = encodeFunctionData({
    abi: permissionedRegistrySetResolverSnippet,
    functionName: 'setResolver',
    args: [BigInt(labelhash(label)), newResolver],
  })

  return { to: registryAddress, data, value: 0n }
}
