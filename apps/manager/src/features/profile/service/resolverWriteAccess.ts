import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
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

export const getResolverWriteAccess = ResultFn(async function* (
  name?: string,
  ownerAddress?: Address,
) {
  if (!name || !ownerAddress) return ok(true)

  const { resolverAddress } = yield* getProfileEthAddressSnapshot(name)
  if (!resolverAddress) return ok(false)

  const writable = yield* fromPromise(
    canWriteEthAddressRecord(resolverAddress, name, ownerAddress),
    (e) => new ResolverWriteAccessError({ cause: e }),
  )

  return ok(writable)
})

export const resolverWriteAccessQuery = (
  name?: string,
  ownerAddress?: Address,
) =>
  resultQueryOptions({
    queryKey: qk('profile', 'resolver_write_access', { name, ownerAddress }),
    queryFn: () => getResolverWriteAccess(name, ownerAddress),
  })
