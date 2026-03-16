import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { sepoliaWithEns } from '@/lib/wagmi'

export const universalResolverAddress = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensUniversalResolver',
})
