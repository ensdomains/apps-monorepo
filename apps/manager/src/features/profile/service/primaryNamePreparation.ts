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
import { getResolverWriteState } from './resolverWriteAccess'

export type PrimaryNamePreparation =
  | { readonly kind: 'ready' }
  | {
      readonly kind: 'update-eth-address'
      readonly existingEthAddress: Address | null
    }
  | {
      readonly kind: 'setup-resolver'
      readonly existingEthAddress: Address | null
      /** False when the name has no resolver, so nothing is being replaced. */
      readonly replacesResolver: boolean
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

  const writeState = await getResolverWriteState(name, ownerAddress)
  if (writeState.isErr()) throw writeState.error

  const existingEthAddress =
    forwardAddress && !isAddressEqual(forwardAddress, zeroAddress)
      ? forwardAddress
      : null

  if (writeState.value.writable) {
    return { kind: 'update-eth-address', existingEthAddress }
  }

  return {
    kind: 'setup-resolver',
    existingEthAddress,
    replacesResolver: writeState.value.resolverAddress !== undefined,
  }
}
