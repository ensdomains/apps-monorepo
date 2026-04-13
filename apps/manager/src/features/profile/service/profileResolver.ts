import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { getResolver as ensjsGetResolver } from '@ensdomains/ensjs/public'
import { fromPromise, ok } from 'neverthrow'
import { safeGetClient } from '@/lib/wagmi/helpers'

class GetResolverError extends TaggedError('GetResolverError')<{
  cause: unknown
}> {}

export const getResolver = ResultFn(async function* (name: string) {
  const client = yield* safeGetClient()

  const nameWithEth = name.endsWith('.eth') ? name : `${name}.eth`

  const resolverAddress = yield* await fromPromise(
    ensjsGetResolver(client, { name: nameWithEth }),
    (e) => new GetResolverError({ cause: e }),
  )

  return ok(resolverAddress ?? undefined)
})

export const profileResolverQuery = (name: string) =>
  resultQueryOptions({
    queryKey: qk('profile', 'resolver', { name }),
    queryFn: ({ queryKey: [{ name }] }) => getResolver(name),
  })
