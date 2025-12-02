import { ENS_SEPOLIA_CONTRACTS } from '@ens-apps/transaction-manager'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { getUnderlyingAddress } from '@ensdomains/ensjs/public/v2'
import { fromPromise, ok } from 'neverthrow'
import { safeGetClient } from '@/lib/wagmi/helpers'

class GetUnderlyingAddressError extends TaggedError(
  'GetUnderlyingAddressError',
)<{
  cause: any
}> {}

export const getResolver = ResultFn(async function* (name: string) {
  const client = yield* safeGetClient()

  const resolverResult = yield* await fromPromise(
    getUnderlyingAddress(client, {
      name,
      resolverAddress: ENS_SEPOLIA_CONTRACTS.UniversalResolver,
    }),
    (e) => new GetUnderlyingAddressError({ cause: e }),
  )

  return ok(resolverResult[0])
})

export const profileResolverQuery = (name: string) =>
  resultQueryOptions({
    queryKey: qk('profile', 'resolver', { name }),
    queryFn: ({ queryKey: [{ name }] }) => getResolver(name),
  })
