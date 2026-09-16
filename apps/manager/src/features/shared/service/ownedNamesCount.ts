import type {
  OwnedNamesCountQuery,
  OwnedNamesCountQueryVariables,
} from '@ens-apps/indexer'
import { OwnedNamesCountDocument } from '@ens-apps/indexer'
import indexerClient, { graphqlRequest } from '@ens-apps/indexer/urql'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { skipToken } from '@tanstack/react-query'
import { ok, ResultAsync } from 'neverthrow'

export class GetOwnedNamesCountError extends TaggedError(
  'GetOwnedNamesCountError',
)<{
  cause: unknown
}> {}

export const getOwnedNamesCount = ResultFn(async function* (
  variables: OwnedNamesCountQueryVariables,
) {
  const data = yield* await ResultAsync.fromPromise(
    graphqlRequest<OwnedNamesCountQuery, OwnedNamesCountQueryVariables>(
      indexerClient,
      OwnedNamesCountDocument,
      variables,
    ),
    (error) => new GetOwnedNamesCountError({ cause: error }),
  )

  return ok(data.registrationConnection.totalCount ?? 0)
})

const ownedNamesCountQueryKey = (address?: string) =>
  qk('owned_names_count', {
    address: address?.toLowerCase(),
  })

export const ownedNamesCountQueryOptions = (address?: string) =>
  resultQueryOptions({
    queryKey: ownedNamesCountQueryKey(address),
    queryFn: address
      ? () =>
          getOwnedNamesCount({ where: { registrant: address.toLowerCase() } })
      : skipToken,
    meta: {
      dependsOn: ['indexer'],
    },
  })
