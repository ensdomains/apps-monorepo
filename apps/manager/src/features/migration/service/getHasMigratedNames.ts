import type { DomainsQuery, DomainsQueryVariables } from '@ens-apps/indexer'
import { DomainsDocument } from '@ens-apps/indexer'
import indexerClient from '@ens-apps/indexer/urql'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { skipToken } from '@tanstack/react-query'
import { ok, ResultAsync } from 'neverthrow'

class GetHasMigratedNamesError extends TaggedError('GetHasMigratedNamesError')<{
  cause: unknown
}> {}

export const getHasMigratedNames = ResultFn(async function* (address: string) {
  const variables = {
    where: {
      owner: address.toLowerCase(),
      isMigrated: true,
    },
    first: 1,
    skip: 0,
  } satisfies DomainsQueryVariables

  const data = yield* await ResultAsync.fromPromise(
    indexerClient
      .query<DomainsQuery, DomainsQueryVariables>(DomainsDocument, variables)
      .toPromise()
      .then((result) => {
        if (result.error) throw result.error
        if (!result.data) throw new Error('Indexer query returned no data')
        return result.data
      }),
    (error) => new GetHasMigratedNamesError({ cause: error }),
  )

  return ok(data.domains.length > 0)
})

export const hasMigratedNamesQueryOptions = (address?: string) =>
  resultQueryOptions({
    queryKey: qk('migration', 'has_migrated_names', {
      address: address?.toLowerCase(),
    }),
    queryFn: address
      ? () => getHasMigratedNames(address.toLowerCase())
      : skipToken,
    meta: {
      dependsOn: ['indexer'],
    },
  })
