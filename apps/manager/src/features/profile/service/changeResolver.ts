import { type Call, ENS_SEPOLIA_CONTRACTS } from '@ens-apps/transaction-manager'
import { permissionedRegistrySetResolverSnippet } from '@ensdomains/ensjs-abi/v2/permissionedRegistry'
import { type Address, encodeFunctionData, labelhash } from 'viem'

/** Strip a trailing `.eth` so a name and its bare label normalize alike. */
const toLabel = (name: string): string => name.replace('.eth', '')

/**
 * The `setResolver` call for an ENS V2 name.
 *
 * Only the call is built here. Its consumer submits it after the replacement
 * resolver has been deployed and seeded with the requested records.
 */
export function buildSetResolverCall({
  name,
  newResolver,
}: {
  name: string
  newResolver: Address
}): Call {
  const data = encodeFunctionData({
    abi: permissionedRegistrySetResolverSnippet,
    functionName: 'setResolver',
    args: [BigInt(labelhash(toLabel(name))), newResolver],
  })

  return { to: ENS_SEPOLIA_CONTRACTS.ETHRegistry, data, value: 0n }
}
