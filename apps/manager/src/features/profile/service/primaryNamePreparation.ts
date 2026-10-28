import { TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { fromPromise } from 'neverthrow'
import {
  type Address,
  BaseError,
  ContractFunctionRevertedError,
  ContractFunctionZeroDataError,
  isAddressEqual,
  type PublicClient,
  parseAbi,
  zeroAddress,
} from 'viem'
import { getEnsResolver } from 'viem/actions'
import { envConfig } from '@/config'
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

const mirroredRegistryAbi = parseAbi([
  'function REGISTRY_V1() view returns (address)',
])

/** ENSv2 reaches ENSv1 names through a resolver that mirrors the ENSv1 registry. */
const isEnsV1MirrorResolver = async (
  publicClient: PublicClient,
  resolver: Address,
): Promise<boolean> => {
  try {
    const registry = await publicClient.readContract({
      address: resolver,
      abi: mirroredRegistryAbi,
      functionName: 'REGISTRY_V1',
    })
    return isAddressEqual(
      registry,
      envConfig.chain.contracts.ensLegacyRegistry.address,
    )
  } catch (error) {
    // Any other resolver lacks the getter; an RPC failure must not read as that.
    if (
      error instanceof BaseError &&
      error.walk(
        (cause) =>
          cause instanceof ContractFunctionRevertedError ||
          cause instanceof ContractFunctionZeroDataError,
      )
    ) {
      return false
    }
    throw error
  }
}

/**
 * An ENSv1 name whose registry resolver resolution no longer reads: its parent
 * expired, or was re-registered on ENSv2, so it can't be a primary name.
 */
export const isUnreachableV1Name = async (
  publicClient: PublicClient,
  name: string,
): Promise<boolean> => {
  const v1Resolver = await readV1RegistryResolver(publicClient, name)
  if (!v1Resolver) return false
  const reached = await getEnsResolver(publicClient, { name })
  if (isAddressEqual(reached, zeroAddress)) return true
  if (isAddressEqual(reached, v1Resolver)) return false
  return !(await isEnsV1MirrorResolver(publicClient, reached))
}

export class UnreachableV1NameError extends TaggedError(
  'UnreachableV1NameError',
)<{
  cause: unknown
}> {}

export const getUnreachableV1NameQueryOptions = (
  publicClient: PublicClient,
  name: string,
) =>
  resultQueryOptions({
    queryKey: qk('profile', 'unreachable_v1_name', {
      name,
      chainId: publicClient.chain?.id,
    }),
    queryFn: () =>
      fromPromise(
        isUnreachableV1Name(publicClient, name),
        (cause) => new UnreachableV1NameError({ cause }),
      ),
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
