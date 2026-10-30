import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { getResolver, getSupportedInterfaces } from '@ensdomains/ensjs/public'
import { registryResolverSnippet } from '@ensdomains/ensjs-abi/registry'
import { fromPromise, ok } from 'neverthrow'
import {
  type Address,
  BaseError,
  type Client,
  ExecutionRevertedError,
  isAddressEqual,
  namehash,
  type PublicClient,
  type Transport,
  zeroAddress,
} from 'viem'
import { envConfig } from '@/config'
import { publicClient, type sepoliaWithEns } from '@/lib/wagmi'
import { safeGetClient } from '@/lib/wagmi/helpers'
import {
  hasV2NameEntry,
  NameRegistryNotFoundError,
  readNameResolver,
  resolveNameRegistry,
} from './changeResolver'
import { getProfileEthAddressSnapshot } from './profileEthAddress'
import {
  encodeResolverRecordsCall,
  getResolverSetterKind,
} from './resolverRecordCalls'

const ETH_COIN_TYPE = 60

class ResolverWriteAccessError extends TaggedError('ResolverWriteAccessError')<{
  cause: unknown
}> {}

/**
 * Dry-run the exact ETH-address write the "set primary name" flow performs
 * (encoded by `encodeResolverRecordsCall` for the resolver's setter family, as
 * the real write is), from the owner's wallet. Resolves `true` if it would
 * succeed, `false` if it reverts — the wallet lacks permission on the resolver,
 * or the resolver does not implement the setter — and throws on any non-revert
 * failure so the caller treats writability as unknown rather than blocking.
 * Exercising the real permission logic makes it correct for every resolver
 * type (per-name dedicated, per-owner, public, or registry-authorized).
 */
export const canWriteEthAddressRecord = async (
  resolverAddress: Address,
  name: string,
  ownerAddress: Address,
): Promise<boolean> => {
  const client = publicClient as PublicClient
  const code = await client.getCode({ address: resolverAddress })
  if (!code || code === '0x') return false
  const data = await encodeResolverRecordsCall({
    kind: await getResolverSetterKind(client, resolverAddress),
    name,
    records: { coins: [{ coin: ETH_COIN_TYPE, value: ownerAddress }] },
  })
  try {
    // Probe from the same owner EOA used by profile record writes.
    await client.call({ account: ownerAddress, to: resolverAddress, data })
    return true
  } catch (error) {
    if (
      error instanceof BaseError &&
      error.walk((e) => e instanceof ExecutionRevertedError)
    ) {
      return false
    }
    throw error
  }
}

/** The resolver set for `name` in the ENSv1 registry, if any. */
export const readV1RegistryResolver = async (
  client: PublicClient,
  name: string,
): Promise<Address | undefined> => {
  const resolver = await client.readContract({
    address: envConfig.chain.contracts.ensLegacyRegistry.address,
    abi: registryResolverSnippet,
    functionName: 'resolver',
    args: [namehash(name)],
  })
  return isAddressEqual(resolver, zeroAddress) ? undefined : resolver
}

type EnsClient = Client<Transport, typeof sepoliaWithEns>

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

/**
 * Whether `address` answers as a resolver. An EOA, or a contract that is not a
 * resolver, reports none of the ids; an RPC failure throws.
 */
const isWorkingResolver = async (
  client: EnsClient,
  address: Address,
): Promise<boolean> => {
  const supported = await getSupportedInterfaces(client, {
    address,
    interfaces: RESOLVER_INTERFACE_IDS,
  })
  return supported.some(Boolean)
}

/** The name's resolver pointer, even when it is not a contract the UniversalResolver can call. */
const findResolverPointer = async (client: EnsClient, name: string) =>
  (await getResolver(client, { name })) ?? undefined

export type ResolverWriteState = {
  /** Undefined when the name has no resolver. */
  readonly resolverAddress: Address | undefined
  readonly canWrite: boolean
  /** The name points at an address that is not a working resolver (an EOA, say). */
  readonly isResolverInvalid: boolean
}

/** The name's resolver (undefined when none is set) and whether the owner wallet can write it. */
export const getResolverWriteState = ResultFn(async function* (
  name?: string,
  ownerAddress?: Address,
) {
  if (!name || !ownerAddress) {
    return ok<ResolverWriteState>({
      resolverAddress: undefined,
      canWrite: false,
      isResolverInvalid: false,
    })
  }

  const toAccessError = (e: unknown) =>
    new ResolverWriteAccessError({ cause: e })
  const client = yield* safeGetClient()
  const v2Resolver = yield* fromPromise(
    (async () => {
      try {
        const location = await resolveNameRegistry(name)
        // An unregistered label reports the ENSv1 fallback resolver, not its own.
        if (!(await hasV2NameEntry(location, publicClient as PublicClient)))
          return { resolver: undefined, hasV2Entry: false }
        const resolver = await readNameResolver(
          location,
          publicClient as PublicClient,
        )
        if (resolver.toLowerCase() !== zeroAddress)
          return { resolver, hasV2Entry: false }
        return { resolver: undefined, hasV2Entry: true }
      } catch (error) {
        if (error instanceof NameRegistryNotFoundError)
          return { resolver: undefined, hasV2Entry: false }
        throw error
      }
    })(),
    toAccessError,
  )
  if (v2Resolver.hasV2Entry)
    return ok<ResolverWriteState>({
      resolverAddress: undefined,
      canWrite: false,
      isResolverInvalid: false,
    })
  const { resolverAddress: reachedResolver } = v2Resolver.resolver
    ? { resolverAddress: v2Resolver.resolver }
    : yield* getProfileEthAddressSnapshot(name)

  // The UniversalResolver reports no resolver when the pointer is not a
  // contract, so read the pointer itself to tell "none" from "invalid".
  if (!reachedResolver) {
    const pointer = yield* fromPromise(
      findResolverPointer(client, name),
      toAccessError,
    )
    const isResolverInvalid = pointer
      ? !(yield* fromPromise(isWorkingResolver(client, pointer), toAccessError))
      : false
    return ok<ResolverWriteState>({
      resolverAddress: undefined,
      canWrite: false,
      isResolverInvalid,
    })
  }

  // Resolution reaches an ENSv1 name through a read-only forwarding resolver;
  // its records live on the resolver in the ENSv1 registry.
  const resolverAddress = v2Resolver.resolver
    ? reachedResolver
    : ((yield* fromPromise(
        readV1RegistryResolver(publicClient as PublicClient, name),
        toAccessError,
      )) ?? reachedResolver)

  const canWrite = yield* fromPromise(
    canWriteEthAddressRecord(resolverAddress, name, ownerAddress),
    toAccessError,
  )
  // Only a resolver the wallet cannot write needs telling apart from a non-resolver.
  const isResolverInvalid = canWrite
    ? false
    : !(yield* fromPromise(
        isWorkingResolver(client, resolverAddress),
        toAccessError,
      ))

  return ok<ResolverWriteState>({
    resolverAddress,
    canWrite,
    isResolverInvalid,
  })
})

export const resolverWriteAccessQuery = (
  name?: string,
  ownerAddress?: Address,
) =>
  resultQueryOptions({
    queryKey: qk('profile', 'resolver_write_access', { name, ownerAddress }),
    queryFn: () =>
      getResolverWriteState(name, ownerAddress).map(({ canWrite }) => canWrite),
  })

export const resolverWriteStateQuery = (name: string, ownerAddress?: Address) =>
  resultQueryOptions({
    queryKey: qk('profile', 'resolver_write_state', { name, ownerAddress }),
    queryFn: () => getResolverWriteState(name, ownerAddress),
  })

/** Bind a draft to its reviewed source, even when another resolver is writable. */
export const assertProfileResolverState = async ({
  name,
  resolverAddress,
  ownerAddress,
  requireWriteAccess = true,
}: {
  readonly name: string
  readonly resolverAddress?: Address
  readonly ownerAddress: Address
  readonly requireWriteAccess?: boolean
}): Promise<void> => {
  const result = await getResolverWriteState(name, ownerAddress)
  if (result.isErr())
    throw new Error(
      'Could not verify the current resolver. Your draft has been kept; check permissions and try again.',
      { cause: result.error },
    )
  const current = result.value
  const sameResolver =
    resolverAddress && current.resolverAddress
      ? isAddressEqual(resolverAddress, current.resolverAddress)
      : resolverAddress === current.resolverAddress
  if (!sameResolver || (requireWriteAccess && !current.canWrite))
    throw new Error(
      'This name’s resolver or your write access changed. Close the editor and review the current records before publishing.',
    )
}
