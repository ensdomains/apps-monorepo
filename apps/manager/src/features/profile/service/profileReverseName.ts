import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { getName } from '@ensdomains/ensjs/public'
import { fromPromise, ok, okAsync } from 'neverthrow'
import type { Address } from 'viem'
import { safeGetClient } from '@/lib/wagmi/helpers'

class ReverseResolverError extends TaggedError('ReverseResolverError')<{
  cause: unknown
}> {}

export const getReverseName = ResultFn(async function* (address?: Address) {
  if (!address) return ok(null)

  const client = yield* safeGetClient()

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
