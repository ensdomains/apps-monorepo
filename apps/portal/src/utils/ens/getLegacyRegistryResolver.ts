import type { EnsChain } from '@ens-apps/config'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { registryResolverSnippet } from '@ensdomains/ensjs-abi/registry'
import type { Address, Client, Transport } from 'viem'
import { namehash, zeroAddress } from 'viem'
import { readContract } from 'viem/actions'
import { getAction } from 'viem/utils'

/**
 * The resolver on a name's own slot in the legacy registry.
 *
 * A lapsed ENSv1 name leaves the UniversalResolver walk when its v2
 * reservation expires, 28 days before its v1 grace ends, while the registry
 * still names the resolver its owner is authorised to write. The name is
 * hashed as given: it is the same string the v1 reads above already used, and
 * normalising here would throw on an encoded `[labelhash]` label.
 */
export const getLegacyRegistryResolver = async (
  client: Client<Transport, EnsChain>,
  name: string,
): Promise<Address | null> => {
  const resolver = await getAction(
    client,
    readContract,
    'readContract',
  )({
    address: getChainContractAddress({
      chain: client.chain,
      contract: 'ensLegacyRegistry',
    }),
    abi: registryResolverSnippet,
    functionName: 'resolver',
    args: [namehash(name)],
  })

  return resolver && resolver !== zeroAddress ? resolver : null
}
