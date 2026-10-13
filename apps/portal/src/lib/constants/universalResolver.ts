import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { ensChain } from '@/lib/wagmi'

export const universalResolverAddress = getChainContractAddress({
  chain: ensChain,
  contract: 'ensUniversalResolver',
})

// The audited, officially-deployed ENS Public Resolver. Used to recognize it on
// the resolver pages so the Type row can label it (and link its docs) instead
// of calling it a custom resolver.
export const officialPublicResolverAddress = getChainContractAddress({
  chain: ensChain,
  contract: 'ensPublicResolver',
})
