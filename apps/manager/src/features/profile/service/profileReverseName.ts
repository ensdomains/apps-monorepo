import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { getName, getNames } from '@ensdomains/ensjs/public'
import { fromPromise, ok, okAsync } from 'neverthrow'
import type { Address } from 'viem'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { getProfileEthAddressSnapshot } from './profileEthAddress'

class ReverseResolverError extends TaggedError('ReverseResolverError')<{
  cause: unknown
}> {}

export const getReverseName = ResultFn(async function* (address?: Address) {
  if (!address) return ok(null)

  const client = yield* safeGetClient()

  const [name] = yield* fromPromise(
    getNames(client, { addresses: [address] }),
    (e) => new ReverseResolverError({ cause: e }),
  ).orElse(() => okAsync<(string | null)[], never>([]))

  if (name) {
    const { ethAddress } = yield* getProfileEthAddressSnapshot(name)

    if (ethAddress?.toLowerCase() === address.toLowerCase()) {
      return ok(name)
    }
  }

  const ensName = yield* fromPromise(
    getName(client, {
      address,
      allowMismatch: true,
    }),
    (e) => new ReverseResolverError({ cause: e }),
  ).orElse(() => okAsync(null))

  if (ensName?.match) {
    return ok(ensName.name)
  }

  return ok(null)
})

export const profileReverseNameQuery = (address?: Address) =>
  resultQueryOptions({
    queryKey: qk('profile', 'reverse_name', { address }),
    queryFn: ({ queryKey: [{ address }] }) => getReverseName(address),
  })
