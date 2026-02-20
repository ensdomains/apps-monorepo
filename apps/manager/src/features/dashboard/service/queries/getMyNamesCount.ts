import type {
  MyNamesCountQuery,
  MyNamesCountQueryVariables,
} from '@ens-apps/indexer'
import { MyNamesCountDocument } from '@ens-apps/indexer'
import indexerClient from '@ens-apps/indexer/urql'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { skipToken } from '@tanstack/react-query'
import { ok, ResultAsync } from 'neverthrow'

export class GetMyNamesCountError extends TaggedError('GetMyNamesCountError')<{
  cause: unknown
}> {}

export const getMyNamesCount = ResultFn(async function* (
  variables: MyNamesCountQueryVariables,
) {
  const data = yield* await ResultAsync.fromPromise(
    indexerClient
      .query<MyNamesCountQuery, MyNamesCountQueryVariables>(
        MyNamesCountDocument,
        variables,
      )
      .toPromise()
      .then((result) => {
        if (result.error) throw result.error
        if (!result.data) throw new Error('Indexer query returned no data')
        return result.data
      }),
    (error) => new GetMyNamesCountError({ cause: error }),
  )

  return ok(data.registrationConnection.totalCount ?? 0)
})

export const myNamesCountQueryOptions = (address?: string) =>
  resultQueryOptions({
    queryKey: qk('dashboard', 'myNames', {
      scope: 'count',
      address: address?.toLowerCase(),
    }),
    queryFn: address
      ? () => getMyNamesCount({ where: { registrant: address.toLowerCase() } })
      : skipToken,
    meta: {
      dependsOn: ['indexer'],
    },
  })
