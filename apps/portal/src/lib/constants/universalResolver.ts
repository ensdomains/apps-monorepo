import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { type Address, isAddressEqual } from 'viem'
import { ensChain } from '@/lib/wagmi'
import { PREVIOUS_PUBLIC_RESOLVERS } from '@/utils/ens/ensContractNames'

export const universalResolverAddress = getChainContractAddress({
  chain: ensChain,
  contract: 'ensUniversalResolver',
})

const PREVIOUS_PUBLIC_RESOLVER = PREVIOUS_PUBLIC_RESOLVERS[ensChain.id]
const OFFICIAL_PUBLIC_RESOLVERS: readonly Address[] = [
  getChainContractAddress({ chain: ensChain, contract: 'ensPublicResolver' }),
  ...(PREVIOUS_PUBLIC_RESOLVER ? [PREVIOUS_PUBLIC_RESOLVER] : []),
]

/** The current or previous official ENS Public Resolver, which the resolver pages label instead of calling it custom. */
export const isOfficialPublicResolver = (address: Address): boolean =>
  OFFICIAL_PUBLIC_RESOLVERS.some((resolver) =>
    isAddressEqual(resolver, address),
  )
