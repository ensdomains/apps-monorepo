import { isKnownPublicResolver } from '@ens-apps/migration'
import {
  ensL1Contracts,
  type SupportedL1ChainId,
} from '@ensdomains/ensjs/chain'
import { type Address, isAddressEqual } from 'viem'
import { DEFAULT_EVM_COIN_TYPE } from '@/lib/coinType'
import { is2LD, isEthName } from '@/utils/ens/tldHelpers'
import type { AddressResolutionRow } from './types'

// Upgrading moves a .eth 2LD off an older public resolver; a subname keeps its old one.
export const canUpgradeReplaceResolver = (name: string): boolean =>
  is2LD(name) && isEthName(name)

// Older ENS PublicResolvers have no default address, so a row that relies on it can't verify.
export const getNeedsLatestResolver = ({
  row,
  v1ResolverAddress,
  chainId,
}: {
  readonly row: Pick<AddressResolutionRow, 'coinType' | 'addressSource'>
  readonly v1ResolverAddress: Address | null | undefined
  readonly chainId: SupportedL1ChainId
}): boolean =>
  !!v1ResolverAddress &&
  (row.coinType === DEFAULT_EVM_COIN_TYPE || row.addressSource === 'default') &&
  isKnownPublicResolver(v1ResolverAddress, chainId) &&
  !isAddressEqual(
    v1ResolverAddress,
    ensL1Contracts[chainId].ensPublicResolver.address,
  )
