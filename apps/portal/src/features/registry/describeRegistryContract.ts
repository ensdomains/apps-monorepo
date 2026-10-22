import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { match } from 'ts-pattern'
import { type Address, isAddressEqual } from 'viem'
import { CONTRACT_DOCS } from '@/lib/constants/contractDocs'
import { ensChain } from '@/lib/wagmi'

// ensjs's `ensRegistry` is the registry that holds .eth names, not the root.
const ETH_REGISTRY = getChainContractAddress({
  chain: ensChain,
  contract: 'ensRegistry',
})

export type RegistryContractDescription = {
  readonly type: string
  readonly docsHref: string
}

/** The Type row: the .eth registry and the root are known by address, the rest come from the factory. */
export const describeRegistryContract = ({
  address,
  rootAddress,
}: {
  readonly address: Address
  readonly rootAddress: Address | null
}): RegistryContractDescription => ({
  type: match(address)
    .when(
      (candidate) => isAddressEqual(candidate, ETH_REGISTRY),
      () => 'Official ENS V2 .eth registry',
    )
    .when(
      (candidate) =>
        rootAddress !== null && isAddressEqual(candidate, rootAddress),
      () => 'Official ENS V2 root registry',
    )
    .otherwise(() => 'Verified ENS V2 permissioned registry'),
  docsHref: CONTRACT_DOCS.registry,
})
