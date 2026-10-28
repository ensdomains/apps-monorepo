import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { queryOptions } from '@tanstack/react-query'
import {
  type Address,
  isAddressEqual,
  type PublicClient,
  zeroAddress,
} from 'viem'
import { getEnsResolver } from 'viem/actions'
import {
  getPrimaryNameForwardAddress,
  hasPrimaryNameForwardAddress,
} from './primaryNameForwardAddress'
import { isOffchainResolver } from './resolverRecordCalls'
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
      /** Its records come from an outside gateway, so only that provider can set them. */
      readonly hasOffchainResolver: boolean
    }

/** An ENSv1 resolver that resolution no longer reaches, e.g. under an expired parent. */
export const hasV1RegistryResolver = async (
  publicClient: PublicClient,
  name: string,
): Promise<boolean> =>
  (await readV1RegistryResolver(publicClient, name)) !== undefined

/** An ENSv1 name with a resolver that resolution cannot reach, so it can't be a primary name. */
export const isUnreachableV1Name = async (
  publicClient: PublicClient,
  name: string,
): Promise<boolean> =>
  isAddressEqual(await getEnsResolver(publicClient, { name }), zeroAddress) &&
  (await hasV1RegistryResolver(publicClient, name))

export const unreachableV1NameQuery = (
  publicClient: PublicClient,
  name: string,
) =>
  queryOptions({
    queryKey: qk('profile', 'unreachable_v1_name', {
      name,
      chainId: publicClient.chain?.id,
    }),
    queryFn: () => isUnreachableV1Name(publicClient, name),
  })

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
    hasOffchainResolver:
      resolverAddress !== undefined &&
      (await isOffchainResolver(publicClient, resolverAddress, name)),
  }
}
