import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { labelToCanonicalId } from '@ensdomains/ensjs/utils/v2'
import { type ClientError, gql } from 'graphql-request'
import { fromPromise, ok } from 'neverthrow'
import { graphqlIndexerClient } from '@/lib/indexer'
import {
  filterEventsByResource,
  type IndexerEACEvent,
} from '@/lib/roles/filterEventsByResource'
import { toResourceHex } from '@/lib/roles/toResourceHex'

export type { RoleHistoryEntry } from '@/lib/roles/filterEventsByResource'

class GetRoleHistoryError extends TaggedError('GetRoleHistoryError')<{
  cause: ClientError
}> {}

type GetRoleHistoryParameters = {
  readonly name: string
  readonly label?: string
}

const getRoleHistory = ResultFn(async function* ({
  name: _name,
  label,
}: GetRoleHistoryParameters) {
  // NOTE: We intentionally do not filter by `domain` in the GraphQL query.
  // The indexer does not currently populate the `domain` relation on
  // `EACRolesChanged` events for many names (e.g. 2LDs like `fresh.eth`),
  // so filtering server-side by `domain` would drop valid events. Instead we
  // fetch by event type and filter client-side by the resource hex.
  const { events } = yield* fromPromise(
    graphqlIndexerClient.request<{
      events: IndexerEACEvent[]
    }>(
      gql`
        query getRoleHistory {
          events(
            where: { type: "EACRolesChanged" }
            first: 1000
            orderBy: blockNumber
            orderDirection: desc
          ) {
            type
            data
            transactionHash
            timestamp
            blockNumber
          }
        }
      `,
    ),
    (e) => new GetRoleHistoryError({ cause: e as ClientError }),
  )

  const resource = label ? toResourceHex(labelToCanonicalId(label)) : undefined

  return ok(filterEventsByResource(events, resource))
})

const getRoleHistoryQueryKey = createQueryKey<
  'get-role-history',
  GetRoleHistoryParameters
>('get-role-history')

export const getRoleHistoryQueryOptions = (params: GetRoleHistoryParameters) =>
  resultQueryOptions({
    queryKey: getRoleHistoryQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getRoleHistory(params),
  })
