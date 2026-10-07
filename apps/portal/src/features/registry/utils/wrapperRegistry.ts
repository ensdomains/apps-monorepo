import {
  computeWrapperRegistryAddress,
  DESTINATION_CONTRACTS,
} from '@ens-apps/smart-account'
import { normalize } from '@ensdomains/ensjs/utils'
import type { Address } from 'viem'

/**
 * The WrapperRegistry a locked migration would deploy for `name` on `chainId`,
 * or `null` when the chain has no migration contracts or the name can't have
 * one. The address is derived, not read, so a subregistry equal to it is the
 * canonical wrapper.
 */
export const getExpectedWrapperRegistry = ({
  name,
  chainId,
}: {
  readonly name: string
  readonly chainId: number
}): Address | null => {
  const contracts = DESTINATION_CONTRACTS[chainId]
  if (!contracts) return null

  try {
    return computeWrapperRegistryAddress({ name: normalize(name), contracts })
  } catch {
    // Not normalisable, so there's no wrapper to match against.
    return null
  }
}
