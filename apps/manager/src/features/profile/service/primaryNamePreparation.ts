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
import {
  getResolverWriteState,
  readV1RegistryResolver,
} from './resolverWriteAccess'

export type PrimaryNamePreparation =
  | { readonly kind: 'ready' }
  | {
      readonly kind: 'update-eth-address'
      readonly existingEthAddress: Address | null
      /** The resolver the write probe passed on, which the write must target. */
      readonly resolverAddress: Address
    }
  | {
      readonly kind: 'setup-resolver'
      readonly existingEthAddress: Address | null
      readonly hasResolver: boolean
    }

/** An ENSv1 resolver that resolution no longer reaches, e.g. under an expired parent. */
export const hasV1RegistryResolver = async (
  publicClient: PublicClient,
  name: string,
): Promise<boolean> =>
  (await readV1RegistryResolver(publicClient, name)) !== undefined

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

  const { resolverAddress, canWrite } = writeState.value
  if (canWrite && resolverAddress) {
    return { kind: 'update-eth-address', existingEthAddress, resolverAddress }
  }

  return {
    kind: 'setup-resolver',
    existingEthAddress,
    // A subname inheriting a wildcard parent's resolver counts as having one: ours would shadow it.
    hasResolver: resolverAddress !== undefined,
  }
}
