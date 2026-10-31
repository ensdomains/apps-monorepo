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
  readonly isVerified: boolean
  readonly docsHref: string
}

/** The Type row: the .eth registry and the root are known by address, the rest come from the factory. */
export const describeRegistryContract = ({
  address,
  rootAddress,
  isUntrusted,
}: {
  readonly address: Address
  readonly rootAddress: Address | null
  /** Runs an untrusted UserRegistry implementation (WEB-2028); `undefined` while the check is pending or failed. */
  readonly isUntrusted: boolean | undefined
}): RegistryContractDescription => ({
  type: match(address)
    .when(
      () => isUntrusted === true,
      () => 'Untrusted ENS V2 permissioned registry',
    )
    .when(
      (candidate) => isAddressEqual(candidate, ETH_REGISTRY),
      () => 'Official ENS V2 .eth registry',
    )
    .when(
      (candidate) =>
        rootAddress !== null && isAddressEqual(candidate, rootAddress),
      () => 'Official ENS V2 root registry',
    )
    .when(
      () => isUntrusted === false,
      () => 'Verified ENS V2 permissioned registry',
    )
    .otherwise(() => 'ENS V2 permissioned registry'),
  isVerified: isUntrusted === false,
  docsHref: CONTRACT_DOCS.registry,
})
