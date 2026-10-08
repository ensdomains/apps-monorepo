import {
  type Address,
  isAddressEqual,
  type PublicClient,
  zeroAddress,
} from 'viem'
import {
  getPrimaryNameForwardAddress,
  hasPrimaryNameForwardAddress,
} from './primaryNameForwardAddress'
import { getResolverWriteAccess } from './resolverWriteAccess'

export type PrimaryNamePreparation =
  | { readonly kind: 'ready' }
  | {
      readonly kind: 'update-eth-address' | 'setup-resolver'
      readonly existingEthAddress: Address | null
    }

/** Decide from fresh chain reads, not cached profile records or indexer hints. */
export async function getPrimaryNamePreparation(
  publicClient: PublicClient,
  name: string,
  ownerAddress: Address,
): Promise<PrimaryNamePreparation> {
  const forwardAddress = await getPrimaryNameForwardAddress(publicClient, name)
  if (hasPrimaryNameForwardAddress(forwardAddress, ownerAddress)) {
    return { kind: 'ready' }
  }

  const writeAccess = await getResolverWriteAccess(name, ownerAddress)
  if (writeAccess.isErr()) throw writeAccess.error

  return {
    kind: writeAccess.value ? 'update-eth-address' : 'setup-resolver',
    existingEthAddress:
      forwardAddress && !isAddressEqual(forwardAddress, zeroAddress)
        ? forwardAddress
        : null,
  }
}
