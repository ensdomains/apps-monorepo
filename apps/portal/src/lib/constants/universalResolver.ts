import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { type Address, isAddressEqual } from 'viem'
import { ensChain } from '@/lib/wagmi'
import { PREVIOUS_PUBLIC_RESOLVERS } from '@/utils/ens/ensContractNames'

export const universalResolverAddress = getChainContractAddress({
  chain: ensChain,
  contract: 'ensUniversalResolver',
})

const OFFICIAL_PUBLIC_RESOLVERS: readonly Address[] = [
  getChainContractAddress({ chain: ensChain, contract: 'ensPublicResolver' }),
  ...(PREVIOUS_PUBLIC_RESOLVERS[ensChain.id]
    ? [PREVIOUS_PUBLIC_RESOLVERS[ensChain.id]]
    : []),
]

// The audited, officially-deployed ENS Public Resolver. Used to recognize it on
// the resolver pages so the Type row can label it (and link its docs) instead
// of calling it a custom resolver.
export const isOfficialPublicResolver = (address: Address): boolean =>
  OFFICIAL_PUBLIC_RESOLVERS.some((resolver) =>
    isAddressEqual(resolver, address),
  )
