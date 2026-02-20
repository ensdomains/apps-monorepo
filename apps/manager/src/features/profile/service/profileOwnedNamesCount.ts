import type {
  OwnedNamesCountQuery,
  OwnedNamesCountQueryVariables,
} from '@ens-apps/indexer'
import { OwnedNamesCountDocument } from '@ens-apps/indexer'
import indexerClient from '@ens-apps/indexer/urql'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { skipToken } from '@tanstack/react-query'
import { ok, ResultAsync } from 'neverthrow'
import type { Address } from 'viem'

class GetOwnedNamesCountError extends TaggedError('GetOwnedNamesCountError')<{
  cause: unknown
}> {}

export const getOwnedNamesCount = ResultFn(async function* (
  where: OwnedNamesCountQueryVariables,
) {
  const data = yield* await ResultAsync.fromPromise(
    indexerClient
      .query<OwnedNamesCountQuery, OwnedNamesCountQueryVariables>(
        OwnedNamesCountDocument,
        where,
      )
      .toPromise()
      .then((result) => {
        if (result.error) throw result.error
        if (!result.data) throw new Error('Indexer query returned no data')
        return result.data
      }),
    (error) => new GetOwnedNamesCountError({ cause: error }),
  )

  return ok(data.registrationConnection.totalCount ?? 0)
})

export const profileOwnedNamesCountQuery = (address?: Address) =>
  resultQueryOptions({
    queryKey: qk('profile', 'owned_names_count', {
      address: address?.toLowerCase(),
    }),
    queryFn: address
      ? () =>
          getOwnedNamesCount({
            where: {
              registrant: address.toLowerCase(),
            },
          })
      : skipToken,
    meta: {
      dependsOn: ['indexer'],
    },
  })
