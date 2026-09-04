/**
 * Role-change history for a single account at the **registry root** resource.
 *
 * There is no server-side filter that isolates root grants: they carry no name
 * on the indexer, and `involved` does not match the EAC `account` field. So the
 * registry's `EACRolesChanged` feed is paged with `eventConnection.after` until
 * exhausted or `MAX_PAGES`, then narrowed client-side to `ROOT_RESOURCE` for
 * the account. The result says whether the scan reached the end, because a
 * registry too large to exhaust must not read as "no history".
 */

import type { GraphqlRequestError } from '@ens-apps/indexer/urql'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { gql } from '@urql/core'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import { graphqlIndexerClient } from '@/lib/indexer'
import {
  filterEventsByResource,
  type IndexerEACEvent,
  type RoleHistoryEntry,
} from '@/lib/roles/filterEventsByResource'

class GetRegistryRoleHistoryError extends TaggedError(
  'GetRegistryRoleHistoryError',
)<{
  cause: GraphqlRequestError
}> {}

export type GetRegistryRoleHistoryParameters = {
  readonly registryAddress: Address
  readonly account: Address
}

export type RegistryRoleHistory = {
  readonly entries: readonly RoleHistoryEntry[]
  /** False when the registry held more role events than the scan reached. */
  readonly isComplete: boolean
}

// 32-byte zero — registry-wide ROOT_RESOURCE (see useRegistryRoles.ts).
const ROOT_RESOURCE_HEX = `0x${'0'.repeat(64)}`

const PAGE_SIZE = 1000
// Exhausts any user-deployed subregistry, which has a handful of role events.
// The `.eth` registry has ~170k and stops here, reported as incomplete.
export const MAX_PAGES = 10

type EventsPage = {
  readonly eventConnection: {
    readonly pageInfo: {
      readonly hasNextPage: boolean
      readonly endCursor: string | null
    }
    readonly edges: readonly { readonly node: IndexerEACEvent }[]
  } | null
}

export const getRegistryRoleHistoryForAccount = ResultFn(async function* ({
  registryAddress,
  account,
}: GetRegistryRoleHistoryParameters) {
  const events: IndexerEACEvent[] = []
  let after: string | undefined
  let hasNextPage = true

  for (let page = 0; page < MAX_PAGES && hasNextPage; page++) {
    const { eventConnection } = yield* fromPromise(
      graphqlIndexerClient.request<EventsPage>(
        gql`
          query getRegistryRoleHistoryForAccount(
            $contractAddress: String!
            $first: Int!
            $after: String
          ) {
            eventConnection(
              where: {
                type_in: ["EACRolesChanged"]
                contractAddress: $contractAddress
              }
              first: $first
              after: $after
              orderBy: blockNumber
              orderDirection: desc
            ) {
              pageInfo {
                hasNextPage
                endCursor
              }
              edges {
                node {
                  type
                  data
                  transactionHash
                  timestamp
                  blockNumber
                }
              }
            }
          }
        `,
        {
          contractAddress: registryAddress.toLowerCase(),
          first: PAGE_SIZE,
          after,
        },
      ),
      (e) =>
        new GetRegistryRoleHistoryError({ cause: e as GraphqlRequestError }),
    )

    events.push(...(eventConnection?.edges.map(({ node }) => node) ?? []))
    hasNextPage = eventConnection?.pageInfo.hasNextPage ?? false
    after = eventConnection?.pageInfo.endCursor ?? undefined

    // A page that claims more without a cursor cannot be followed.
    if (hasNextPage && !after) break
  }

  const target = account.toLowerCase()
  const entries = filterEventsByResource(events, ROOT_RESOURCE_HEX).filter(
    (entry) => entry.account.toLowerCase() === target,
  )

  return ok({ entries, isComplete: !hasNextPage } satisfies RegistryRoleHistory)
})

const getRegistryRoleHistoryForAccountQueryKey = createQueryKey<
  'get-registry-role-history-for-account',
  GetRegistryRoleHistoryParameters
>('get-registry-role-history-for-account')

export const getRegistryRoleHistoryForAccountQueryOptions = (
  params: GetRegistryRoleHistoryParameters,
) =>
  resultQueryOptions({
    queryKey: getRegistryRoleHistoryForAccountQueryKey(params),
    queryFn: ({ queryKey: [, params] }) =>
      getRegistryRoleHistoryForAccount(params),
  })
