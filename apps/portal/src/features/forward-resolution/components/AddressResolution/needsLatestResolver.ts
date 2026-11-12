import {
  isKnownPublicResolver,
  LATEST_V1_PUBLIC_RESOLVERS,
} from '@ens-apps/migration'
import type { SupportedL1ChainId } from '@ensdomains/ensjs/chain'
import { type Address, isAddressEqual } from 'viem'
import { DEFAULT_EVM_COIN_TYPE } from '@/lib/coinType'
import type { AddressResolutionRow } from './types'

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
  !isAddressEqual(v1ResolverAddress, LATEST_V1_PUBLIC_RESOLVERS[chainId])
