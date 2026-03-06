import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { labelToCanonicalId } from '@ensdomains/ensjs/utils/v2'
import { type ClientError, gql } from 'graphql-request'
import { fromPromise, ok } from 'neverthrow'
import type { Address, Hex } from 'viem'
import { getAddress } from 'viem'
import { graphqlIndexerClient } from '@/lib/indexer'
import { decodeRoleBitmap } from '@/lib/roles/decodeRoleBitmap'
import { toResourceHex } from '@/lib/roles/toResourceHex'

class GetRoleHistoryError extends TaggedError('GetRoleHistoryError')<{
  cause: ClientError
}> {}

type GetRoleHistoryParameters = {
  name: string
  label: string
}

type IndexerEACEvent = {
  type: string
  data: string
  transactionHash: Hex
  timestamp: number
  blockNumber: number
}

type EACRolesChangedData = {
  resource: string
  account: string
  oldRoleBitmap: string
  newRoleBitmap: string
}

export type RoleHistoryEntry = {
  account: Address
  resource: string
  oldRoles: string[]
  newRoles: string[]
  transactionHash: Hex
  timestamp: number
  blockNumber: number
}

export const filterEventsByResource = (
  events: IndexerEACEvent[],
  resource: string,
): RoleHistoryEntry[] => {
  const filtered: RoleHistoryEntry[] = []

  for (const event of events) {
    if (!event.data) continue

    const data = JSON.parse(event.data) as EACRolesChangedData
    if (!data.resource || !data.account) continue

    // The resource in the event data may have different casing/padding,
    // so compare as lowercase
    if (data.resource.toLowerCase() !== resource.toLowerCase()) continue

    filtered.push({
      account: getAddress(data.account),
      resource: data.resource,
      oldRoles: decodeRoleBitmap(data.oldRoleBitmap),
      newRoles: decodeRoleBitmap(data.newRoleBitmap),
      transactionHash: event.transactionHash,
      timestamp: event.timestamp,
      blockNumber: event.blockNumber,
    })
  }

  // Sort by most recent first
  return filtered.toSorted((a, b) => b.blockNumber - a.blockNumber)
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

  const resource = toResourceHex(labelToCanonicalId(label))

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
