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
  name,
  label,
}: GetRoleHistoryParameters) {
  const { events } = yield* fromPromise(
    graphqlIndexerClient.request<{
      events: IndexerEACEvent[]
    }>(
      gql`
        query getRoleHistory($name: String!) {
          events(
            where: { domain: $name, type: "EACRolesChanged" }
            first: 100
          ) {
            type
            data
            transactionHash
            timestamp
            blockNumber
          }
        }
      `,
      { name: name.toLowerCase() },
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
