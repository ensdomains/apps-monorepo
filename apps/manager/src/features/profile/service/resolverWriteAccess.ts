import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { registryResolverSnippet } from '@ensdomains/ensjs-abi/registry'
import { fromPromise, ok } from 'neverthrow'
import {
  type Address,
  BaseError,
  ExecutionRevertedError,
  isAddressEqual,
  namehash,
  type PublicClient,
  zeroAddress,
} from 'viem'
import { envConfig } from '@/config'
import { publicClient } from '@/lib/wagmi'
import {
  hasV2NameEntry,
  NameRegistryNotFoundError,
  readNameResolver,
  resolveNameRegistry,
} from './changeResolver'
import { getProfileEthAddressSnapshot } from './profileEthAddress'
import {
  type EditableRecordTypes,
  hasEditableRecordType,
  NO_EDITABLE_RECORD_TYPES,
} from './recordTypeLocks'
import {
  encodeResolverRecordsCall,
  getResolverSetterKind,
  type ResolverRecords,
  type ResolverSetterKind,
} from './resolverRecordCalls'

const ETH_COIN_TYPE = 60
const PROFILE_PROBE_TEXT_KEY = 'description'

/** Which write the probe dry-runs: the ETH address, or any profile record. */
export type ResolverWriteAccess = 'eth-address' | 'profile'

class ResolverWriteAccessError extends TaggedError('ResolverWriteAccessError')<{
  cause: unknown
}> {}

type RecordWriteProbe = {
  readonly resolverAddress: Address
  readonly kind: ResolverSetterKind
  readonly name: string
  readonly ownerAddress: Address
}

const getRecordWriteProbe = async (
  resolverAddress: Address,
  name: string,
  ownerAddress: Address,
): Promise<RecordWriteProbe | undefined> => {
  const client = publicClient as PublicClient
  const code = await client.getCode({ address: resolverAddress })
  if (!code || code === '0x') return undefined
  return {
    resolverAddress,
    kind: await getResolverSetterKind(client, resolverAddress),
    name,
    ownerAddress,
  }
}

const canWriteRecords = async (
  probe: RecordWriteProbe,
  records: ResolverRecords,
): Promise<boolean> => {
  const data = await encodeResolverRecordsCall({
    kind: probe.kind,
    name: probe.name,
    records,
  })
  try {
    // Probe from the same owner EOA used by profile record writes.
    await (publicClient as PublicClient).call({
      account: probe.ownerAddress,
      to: probe.resolverAddress,
      data,
    })
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

const ethAddressRecords = (ownerAddress: Address): ResolverRecords => ({
  coins: [{ coin: ETH_COIN_TYPE, value: ownerAddress }],
})

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
  const probe = await getRecordWriteProbe(resolverAddress, name, ownerAddress)
  return probe ? canWriteRecords(probe, ethAddressRecords(ownerAddress)) : false
}

// The non-address probes clear a value, so they need no real data.
const getEditableRecordTypes = async (
  resolverAddress: Address,
  name: string,
  ownerAddress: Address,
): Promise<EditableRecordTypes> => {
  const probe = await getRecordWriteProbe(resolverAddress, name, ownerAddress)
  if (!probe) return NO_EDITABLE_RECORD_TYPES
  const [address, text, contentHash, abi] = await Promise.all([
    canWriteRecords(probe, ethAddressRecords(ownerAddress)),
    canWriteRecords(probe, {
      texts: [{ key: PROFILE_PROBE_TEXT_KEY, value: '' }],
    }),
    canWriteRecords(probe, { contentHash: null }),
    canWriteRecords(probe, { abi: { encodeAs: 'json', data: null } }),
  ])
  return { address, text, contentHash, abi }
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

const findRecordsResolver = ResultFn(async function* (name: string) {
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
    (cause) => new ResolverWriteAccessError({ cause }),
  )
  if (v2Resolver.hasV2Entry) return ok(undefined)
  const { resolverAddress: reachedResolver } = v2Resolver.resolver
    ? { resolverAddress: v2Resolver.resolver }
    : yield* getProfileEthAddressSnapshot(name)
  if (!reachedResolver) return ok(undefined)

  // Resolution reaches an ENSv1 name through a read-only forwarding resolver;
  // its records live on the resolver in the ENSv1 registry.
  const resolverAddress: Address = v2Resolver.resolver
    ? reachedResolver
    : ((yield* fromPromise(
        readV1RegistryResolver(publicClient as PublicClient, name),
        (cause) => new ResolverWriteAccessError({ cause }),
      )) ?? reachedResolver)
  return ok(resolverAddress)
})

/** The name's resolver and which record types the owner wallet can write on it. */
export const getProfileRecordAccess = ResultFn(async function* (
  name?: string,
  ownerAddress?: Address,
) {
  const noAccess = {
    resolverAddress: undefined,
    canWrite: false,
    editableTypes: NO_EDITABLE_RECORD_TYPES,
  }
  if (!name || !ownerAddress) return ok(noAccess)
  const resolverAddress = yield* findRecordsResolver(name)
  if (!resolverAddress) return ok(noAccess)

  const editableTypes = yield* fromPromise(
    getEditableRecordTypes(resolverAddress, name, ownerAddress),
    (cause) => new ResolverWriteAccessError({ cause }),
  )

  return ok({
    resolverAddress,
    canWrite: hasEditableRecordType(editableTypes),
    editableTypes,
  })
})

/** The name's resolver (undefined when none is set) and whether the owner wallet can write it. */
export const getResolverWriteState = ResultFn(async function* (
  name?: string,
  ownerAddress?: Address,
  access: ResolverWriteAccess = 'eth-address',
) {
  if (access === 'profile') {
    const { resolverAddress, canWrite } = yield* getProfileRecordAccess(
      name,
      ownerAddress,
    )
    return ok({ resolverAddress, canWrite })
  }
  if (!name || !ownerAddress) {
    return ok({ resolverAddress: undefined, canWrite: false })
  }

  const resolverAddress = yield* findRecordsResolver(name)
  if (!resolverAddress)
    return ok({ resolverAddress: undefined, canWrite: false })

  const canWrite = yield* fromPromise(
    canWriteEthAddressRecord(resolverAddress, name, ownerAddress),
    (e) => new ResolverWriteAccessError({ cause: e }),
  )

  return ok({ resolverAddress, canWrite })
})

export const resolverWriteAccessQuery = (
  name?: string,
  ownerAddress?: Address,
  access: ResolverWriteAccess = 'eth-address',
) =>
  resultQueryOptions({
    queryKey: qk('profile', 'resolver_write_access', {
      name,
      ownerAddress,
      access,
    }),
    queryFn: () =>
      getResolverWriteState(name, ownerAddress, access).map(
        ({ canWrite }) => canWrite,
      ),
  })

export const resolverWriteStateQuery = (name: string, ownerAddress?: Address) =>
  resultQueryOptions({
    queryKey: qk('profile', 'resolver_write_state', { name, ownerAddress }),
    queryFn: () => getProfileRecordAccess(name, ownerAddress),
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
  const result = await getResolverWriteState(name, ownerAddress, 'profile')
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
