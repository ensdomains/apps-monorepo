/**
 * Role-change history for a single account at the **registry root** resource.
 *
 * Queries `EACRolesChanged` events for the given registry contract from the
 * indexer, then narrows them client-side to events scoped to `ROOT_RESOURCE`
 * for the supplied account. Mirrors the query strategy used by
 * `useNameRoleAccounts` (which is per-name) and `useRoleHistory` (which is
 * global) but scoped to the registry overview's add/edit-user UI.
 */

import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { type ClientError, gql } from 'graphql-request'
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
  cause: ClientError
}> {}

export type GetRegistryRoleHistoryParameters = {
  readonly registryAddress: Address
  readonly account: Address
}

// 32-byte zero — registry-wide ROOT_RESOURCE (see useRegistryRoles.ts).
const ROOT_RESOURCE_HEX = `0x${'0'.repeat(64)}`

const PAGE_SIZE = 1000
// Safety bound mirroring useRoleHistory so a runaway indexer can't loop forever.
const MAX_PAGES = 50

const getRegistryRoleHistoryForAccount = ResultFn(async function* ({
  registryAddress,
  account,
}: GetRegistryRoleHistoryParameters) {
  // Cursor with `blockNumber_lt` (descending) — the indexer's relay-style
  // `eventConnection.after` / `events.skip` pagination is broken on this
  // endpoint (see useRoleHistory.ts for context), so we step the cursor to
  // just before the oldest block of the prior page until exhausted.
  const allEvents: IndexerEACEvent[] = []
  let blockNumberLt = Number.MAX_SAFE_INTEGER

  for (let page = 0; page < MAX_PAGES; page++) {
    const { events } = yield* fromPromise(
      graphqlIndexerClient.request<{ events: IndexerEACEvent[] }>(
        gql`
          query getRegistryRoleHistoryForAccount(
            $contractAddress: String!
            $blockNumberLt: Int!
            $first: Int!
          ) {
            events(
              where: {
                type: "EACRolesChanged"
                contractAddress: $contractAddress
                blockNumber_lt: $blockNumberLt
              }
              first: $first
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
        {
          contractAddress: registryAddress.toLowerCase(),
          blockNumberLt,
          first: PAGE_SIZE,
        },
      ),
      (e) => new GetRegistryRoleHistoryError({ cause: e as ClientError }),
    )

    if (events.length === 0) break
    allEvents.push(...events)
    if (events.length < PAGE_SIZE) break
    blockNumberLt = events[events.length - 1].blockNumber
  }

  const rootEntries = filterEventsByResource(allEvents, ROOT_RESOURCE_HEX)
  const target = account.toLowerCase()
  const accountEntries: RoleHistoryEntry[] = rootEntries.filter(
    (entry) => entry.account.toLowerCase() === target,
  )

  return ok(accountEntries)
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
