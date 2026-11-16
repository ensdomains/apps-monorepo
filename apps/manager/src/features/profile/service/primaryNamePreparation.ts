import { TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { getResolver } from '@ensdomains/ensjs/public'
import { erc165SupportsInterfaceSnippet } from '@ensdomains/ensjs-abi/erc165'
import { fromPromise } from 'neverthrow'
import { match } from 'ts-pattern'
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
      /** The resolver being replaced is not a working resolver. */
      readonly isResolverInvalid: boolean
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

export type V1Reachability = 'reachable' | 'unreachable' | 'check-mirror'

/**
 * Whether resolution still reads an ENSv1 name's registry resolver, given the
 * resolver it reaches. Any other resolver may be ENSv2's ENSv1 mirror, which
 * only a contract read can tell.
 */
export const classifyV1Reachability = ({
  v1Resolver,
  reached,
}: {
  readonly v1Resolver: Address | undefined
  readonly reached: Address
}): V1Reachability => {
  if (!v1Resolver) return 'reachable'
  if (isAddressEqual(reached, zeroAddress)) return 'unreachable'
  if (isAddressEqual(reached, v1Resolver)) return 'reachable'
  return 'check-mirror'
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
  return match(classifyV1Reachability({ v1Resolver, reached }))
    .with('reachable', () => false)
    .with('unreachable', () => true)
    .with(
      'check-mirror',
      async () => !(await isEnsV1MirrorResolver(publicClient, reached)),
    )
    .exhaustive()
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

/**
 * ERC-165 ids a working resolver reports at least one of: `addr`, multicoin
 * `addr`, `text`, `contenthash` (V1 and public resolvers) or
 * `IExtendedResolver` (the V2 PermissionedResolver reports only this).
 */
const RESOLVER_INTERFACE_IDS = [
  '0x3b3b57de',
  '0xf1cb7e06',
  '0x59d1d43c',
  '0xbc1c58d1',
  '0x9061b923',
] as const

/** One `supportsInterface` answer from the multicall; a revert is a failure. */
export type InterfaceProbeResult =
  | { readonly status: 'success'; readonly result: boolean }
  | { readonly status: 'failure' }

/**
 * Whether the ERC-165 answers come from a resolver: at least one of the
 * resolver ids answered `true`. An EOA or a contract that is not a resolver
 * answers none, whether it reverts or returns false.
 */
export const answersAsResolver = (
  results: readonly InterfaceProbeResult[],
): boolean =>
  results.some((result) => result.status === 'success' && result.result)

/**
 * Whether `address` answers as a resolver. An EOA, or a contract that is not a
 * resolver, answers none of the ids; an RPC failure throws.
 */
const isWorkingResolver = async (
  publicClient: PublicClient,
  address: Address,
): Promise<boolean> => {
  const results = await publicClient.multicall({
    contracts: RESOLVER_INTERFACE_IDS.map((interfaceId) => ({
      address,
      abi: erc165SupportsInterfaceSnippet,
      functionName: 'supportsInterface' as const,
      args: [interfaceId] as const,
    })),
    allowFailure: true,
  })
  return answersAsResolver(results)
}

type ResolverPointerClient = Parameters<typeof getResolver>[0]

/** ensjs reads the pointer through the UniversalResolver, so the chain must name it. */
const hasUniversalResolver = (
  client: PublicClient,
): client is PublicClient & ResolverPointerClient =>
  client.chain?.contracts?.ensUniversalResolver !== undefined

/**
 * The name's resolver pointer, past ENSv2's mirror of an ENSv1 name, even when
 * it is not a contract the UniversalResolver can call.
 */
const readResolverPointer = async (
  publicClient: PublicClient,
  name: string,
): Promise<Address | undefined> => {
  if (!hasUniversalResolver(publicClient))
    throw new Error('No ENS UniversalResolver is configured for this network')
  return (await getResolver(publicClient, { name })) ?? undefined
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

  const { resolverAddress, canWrite } = writeState.value
  if (canWrite && resolverAddress) {
    return { kind: 'update-eth-address', existingEthAddress, resolverAddress }
  }

  // Only a resolver the wallet cannot write needs telling apart from a
  // non-resolver. With none reached, the pointer may still be set: the
  // UniversalResolver reports no resolver when it is not a contract.
  const pointer =
    resolverAddress ?? (await readResolverPointer(publicClient, name))
  const isResolverInvalid =
    pointer !== undefined && !(await isWorkingResolver(publicClient, pointer))

  return {
    kind: 'setup-resolver',
    existingEthAddress,
    // A subname inheriting a wildcard parent's resolver counts as having one: ours would shadow it.
    hasResolver: resolverAddress !== undefined,
    hasOffchainResolver:
      resolverAddress !== undefined &&
      (await isOffchainResolver(publicClient, resolverAddress, name)),
    isResolverInvalid,
  }
}
