import { ENS_SEPOLIA_CONTRACTS } from '@ens-apps/transaction-manager'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  type GetUnderlyingResolverErrorType,
  getUnderlyingAddress,
} from '@ensdomains/ensjs/public/v2'
import { fromPromise, ok } from 'neverthrow'
import { getEnsResolver } from 'viem/actions'
import { safeGetClient } from '@/lib/wagmi/helpers'

class GetUnderlyingAddressError extends TaggedError(
  'GetUnderlyingAddressError',
)<{
  cause: GetUnderlyingResolverErrorType
}> {}

export const getResolver = ResultFn(async function* (name: string) {
  const client = yield* safeGetClient()

  const resolverAddress = await getEnsResolver(client, {
    name,
    universalResolverAddress: ENS_SEPOLIA_CONTRACTS.UniversalResolver,
  })

  const resolverResult = yield* await fromPromise(
    getUnderlyingAddress(client, {
      name,
      resolverAddress,
    }),
    (e) =>
      new GetUnderlyingAddressError({
        cause: e as GetUnderlyingResolverErrorType,
      }),
  )

  return ok(resolverResult[0])
})

export const profileResolverQuery = (name: string) =>
  resultQueryOptions({
    queryKey: qk('profile', 'resolver', { name }),
    queryFn: ({ queryKey: [{ name }] }) => getResolver(name),
  })
