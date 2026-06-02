/**
 * Per-user activity log for a single registry contract.
 *
 * The indexer only lets us filter `events` by `contractAddress` / `type` /
 * block range — there's no server-side filter for the account inside the
 * per-event `data` JSON blob. So we paginate every event on the registry
 * (descending by blockNumber) and keep the ones whose parsed `data` mentions
 * the target account in *any* address-like field (`account`, `from`, `to`,
 * `sender`, `registrant`, …).
 *
 * Cursoring is done with `blockNumber_lt` because the indexer's relay-style
 * `eventConnection.after` / `events.skip` pagination is broken on this
 * endpoint (see `useRoleHistory.ts` for context).
 */

import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { type ClientError, gql } from 'graphql-request'
import { fromPromise, ok } from 'neverthrow'
import type { Address, Hash } from 'viem'
import { graphqlIndexerClient } from '@/lib/indexer'

class GetRegistryEventsForAccountError extends TaggedError(
  'GetRegistryEventsForAccountError',
)<{
  cause: ClientError
}> {}

export type GetRegistryEventsForAccountParameters = {
  readonly registryAddress: Address
  readonly account: Address
}

export type RegistryEvent = {
  readonly type: string
  readonly data: Readonly<Record<string, unknown>>
  readonly transactionHash: Hash
  readonly timestamp: number
  readonly blockNumber: number
}

type RawEvent = {
  type: string
  data: string | null
  transactionHash: Hash
  timestamp: number
  blockNumber: number
}

const PAGE_SIZE = 1000
// Safety bound mirroring useRoleHistory so a runaway indexer can't loop forever.
const MAX_PAGES = 50

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/

const safeParseJson = (s: string): Record<string, unknown> | null => {
  try {
    return JSON.parse(s) as Record<string, unknown>
  } catch {
    return null
  }
}

/**
 * Does any value in the event's parsed data match `target` (lowercase
 * address)? Walks the top level only — registry events don't currently nest
 * address fields, so a recursive walk would be needless work.
 */
const eventInvolvesAccount = (
  data: Record<string, unknown>,
  target: string,
): boolean => {
  for (const value of Object.values(data)) {
    if (typeof value !== 'string') continue
    if (!ADDRESS_PATTERN.test(value)) continue
    if (value.toLowerCase() === target) return true
  }
  return false
}

const getRegistryEventsForAccount = ResultFn(async function* ({
  registryAddress,
  account,
}: GetRegistryEventsForAccountParameters) {
  const raw: RawEvent[] = []
  let blockNumberLt = Number.MAX_SAFE_INTEGER

  for (let page = 0; page < MAX_PAGES; page++) {
    const { events } = yield* fromPromise(
      graphqlIndexerClient.request<{ events: RawEvent[] }>(
        gql`
          query getRegistryEventsForAccount(
            $contractAddress: String!
            $blockNumberLt: Int!
            $first: Int!
          ) {
            events(
              where: {
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
      (e) => new GetRegistryEventsForAccountError({ cause: e as ClientError }),
    )

    if (events.length === 0) break
    raw.push(...events)
    if (events.length < PAGE_SIZE) break
    blockNumberLt = events[events.length - 1].blockNumber
  }

  const target = account.toLowerCase()
  const matching: RegistryEvent[] = []

  for (const event of raw) {
    if (!event.data) continue
    const parsed = safeParseJson(event.data)
    if (!parsed) continue
    if (!eventInvolvesAccount(parsed, target)) continue

    matching.push({
      type: event.type,
      data: parsed,
      transactionHash: event.transactionHash,
      timestamp: event.timestamp,
      blockNumber: event.blockNumber,
    })
  }

  return ok(matching)
})

const getRegistryEventsForAccountQueryKey = createQueryKey<
  'get-registry-events-for-account',
  GetRegistryEventsForAccountParameters
>('get-registry-events-for-account')

export const getRegistryEventsForAccountQueryOptions = (
  params: GetRegistryEventsForAccountParameters,
) =>
  resultQueryOptions({
    queryKey: getRegistryEventsForAccountQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getRegistryEventsForAccount(params),
  })
