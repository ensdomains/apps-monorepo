import type { Address, PublicClient } from 'viem'
import {
  getPrimaryNameForwardAddress,
  hasPrimaryNameForwardAddress,
} from './primaryNameForwardAddress'
import { getResolverWriteAccess } from './resolverWriteAccess'

export type PrimaryNamePreparation =
  | 'ready'
  | 'update-eth-address'
  | 'setup-resolver'

/** Decide from fresh chain reads, not cached profile records or indexer hints. */
export async function getPrimaryNamePreparation(
  publicClient: PublicClient,
  name: string,
  ownerAddress: Address,
): Promise<PrimaryNamePreparation> {
  const forwardAddress = await getPrimaryNameForwardAddress(publicClient, name)
  if (hasPrimaryNameForwardAddress(forwardAddress, ownerAddress)) {
    return 'ready'
  }

  const writeAccess = await getResolverWriteAccess(name, ownerAddress)
  if (writeAccess.isErr()) throw writeAccess.error

  return writeAccess.value ? 'update-eth-address' : 'setup-resolver'
}
