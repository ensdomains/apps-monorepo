import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { getResolver, getSupportedInterfaces } from '@ensdomains/ensjs/public'
import { fromPromise, ok } from 'neverthrow'
import {
  type Address,
  BaseError,
  ExecutionRevertedError,
  type PublicClient,
} from 'viem'
import { publicClient } from '@/lib/wagmi'
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
const canWriteEthAddressRecord = async (
  resolverAddress: Address,
  name: string,
  ownerAddress: Address,
): Promise<boolean> => {
  const client = publicClient as PublicClient
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
const isWorkingResolver = async (address: Address): Promise<boolean> => {
  const supported = await getSupportedInterfaces(
    publicClient as unknown as Parameters<typeof getSupportedInterfaces>[0],
    { address, interfaces: RESOLVER_INTERFACE_IDS },
  )
  return supported.some(Boolean)
}

/** The name's resolver pointer, even when it is not a contract the UniversalResolver can call. */
const findResolverPointer = async (name: string) =>
  (await getResolver(
    publicClient as unknown as Parameters<typeof getResolver>[0],
    { name },
  )) ?? undefined

export type ResolverWriteState = {
  /** Undefined when the name has no resolver. */
  readonly resolverAddress: Address | undefined
  readonly canWrite: boolean
  /** The name points at an address that is not a working resolver (an EOA, say). */
  readonly isResolverInvalid: boolean
}

/** The name's resolver and whether the owner wallet can write it. */
export const getResolverWriteState = ResultFn(async function* (
  name?: string,
  ownerAddress?: Address,
) {
  if (!name || !ownerAddress) {
    return ok<ResolverWriteState>({
      resolverAddress: undefined,
      canWrite: true,
      isResolverInvalid: false,
    })
  }

  const toAccessError = (e: unknown) =>
    new ResolverWriteAccessError({ cause: e })
  const { resolverAddress } = yield* getProfileEthAddressSnapshot(name)

  // The UniversalResolver reports no resolver when the pointer is not a
  // contract, so read the pointer itself to tell "none" from "invalid".
  if (!resolverAddress) {
    const pointer = yield* fromPromise(findResolverPointer(name), toAccessError)
    const isResolverInvalid = pointer
      ? !(yield* fromPromise(isWorkingResolver(pointer), toAccessError))
      : false
    return ok<ResolverWriteState>({
      resolverAddress: isResolverInvalid ? pointer : undefined,
      canWrite: false,
      isResolverInvalid,
    })
  }

  const canWrite = yield* fromPromise(
    canWriteEthAddressRecord(resolverAddress, name, ownerAddress),
    toAccessError,
  )
  // Only a resolver the wallet cannot write needs telling apart from a non-resolver.
  const isResolverInvalid = canWrite
    ? false
    : !(yield* fromPromise(isWorkingResolver(resolverAddress), toAccessError))

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
    queryFn: () => getResolverWriteState(name, ownerAddress),
  })
