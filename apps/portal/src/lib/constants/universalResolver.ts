import { PREVIOUS_V1_PUBLIC_RESOLVERS } from '@ens-apps/migration/known-resolvers'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { type Address, isAddressEqual } from 'viem'
import { ensChain } from '@/lib/wagmi'

export const universalResolverAddress = getChainContractAddress({
  chain: ensChain,
  contract: 'ensUniversalResolver',
})

// The newest audited ENS Public Resolver, offered to v1 names as the latest resolver.
export const officialPublicResolverAddress = getChainContractAddress({
  chain: ensChain,
  contract: 'ensPublicResolver',
})

// The resolver pages label both as the official ENS Public Resolver, not a custom one.
export const isOfficialPublicResolver = (address: Address): boolean =>
  [
    officialPublicResolverAddress,
    PREVIOUS_V1_PUBLIC_RESOLVERS[ensChain.id],
  ].some((official) => isAddressEqual(official, address))
