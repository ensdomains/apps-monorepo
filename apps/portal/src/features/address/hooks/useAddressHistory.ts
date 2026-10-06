import {
  type BignameError,
  type EventRow,
  fetchAllPages,
  MAX_PAGE_SIZE,
  timestampToSeconds,
} from '@ens-apps/bigname'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { fromPromise } from 'neverthrow'
import type { Address } from 'viem'
import { bigname } from '@/lib/bigname'
import {
  flattenHistoryData,
  historyEventLogId,
} from '@/utils/history/historyEventsToSubgraphEvents'
import { withoutDuplicateCharges } from '@/utils/history/historyPayment'
import type {
  AddressHistoryEvent,
  AddressNameHistory,
} from '@/utils/history/transformAddressHistory'

class GetAddressHistoryError extends TaggedError('GetAddressHistoryError')<{
  cause: BignameError
}> {}

type GetAddressHistoryParameters = {
  readonly address: Address
  /**
   * Read one page of this many rows — the recent-history teaser. Omitted, the
   * history is read through the final page.
   */
  readonly pageSize?: number
}

const readHistory = async (
  address: Address,
  pageSize: number | undefined,
  signal?: AbortSignal,
) => {
  const read = (cursor: string | undefined, page_size: number) =>
    bigname.getAddressHistory(
      address.toLowerCase(),
      {
        relation: 'any',
        include: ['data', 'raw'],
        order: 'desc',
        page_size,
        cursor,
      },
      { signal },
    )
  if (pageSize !== undefined) return (await read(undefined, pageSize)).data
  const { rows } = await fetchAllPages(
    (cursor) => read(cursor, MAX_PAGE_SIZE),
    {
      maxRows: Number.POSITIVE_INFINITY,
      maxPages: Number.POSITIVE_INFINITY,
      signal,
    },
  )
  return rows
}

/**
 * The names the address holds the token of, from a `relation=owner` names read:
 * `owner` is the token holder (BaseRegistrar, NameWrapper or ENSv2 token; the
 * registry owner only for a tokenless subname, which `attributeName` never
 * treats as a root). A `manager` relation alone is the registry controller,
 * which any parent owner can assign, so it does not count.
 */
const readHeldNames = async (
  address: Address,
  signal?: AbortSignal,
): Promise<Set<string>> => {
  const { rows } = await fetchAllPages(
    (cursor) =>
      bigname.listAddressNames(
        address.toLowerCase(),
        {
          relation: 'owner',
          page_size: MAX_PAGE_SIZE,
          cursor,
        },
        { signal },
      ),
    {
      maxRows: Number.POSITIVE_INFINITY,
      maxPages: Number.POSITIVE_INFINITY,
      signal,
    },
  )
  return new Set(rows.map(({ name }) => name))
}

const toEvent = (row: EventRow): AddressHistoryEvent[] => {
  const timestamp = timestampToSeconds(row.timestamp)
  // A state-derived row has no transaction for the table to group under.
  if (!row.transaction_hash || row.block_number === null || !timestamp)
    return []
  return [
    {
      id: historyEventLogId(row),
      transactionHash: row.transaction_hash,
      blockNumber: row.block_number,
      name: row.name ?? '',
      type: row.kind ?? row.type,
      timestamp,
      data: flattenHistoryData(row.data),
    },
  ]
}

/**
 * An address's history, one bigname stream over every name it is the owner,
 * manager or a role holder of, ENSv1 and ENSv2 alike, grouped by name.
 *
 * Grouped rather than flat because whether a name's history is the address's
 * own is decided per name (see `nameAttribution.ts`), and that needs each
 * name's provenance: `registrarHolder` is the address when it holds the name's
 * token, read from the names list since history rows carry no relations.
 */
const getAddressHistory = (
  { address, pageSize }: GetAddressHistoryParameters,
  signal?: AbortSignal,
) =>
  fromPromise(
    Promise.all([
      readHistory(address, pageSize, signal),
      readHeldNames(address, signal),
    ]),
    (e) => new GetAddressHistoryError({ cause: e as BignameError }),
  ).map(([rows, heldNames]): AddressNameHistory[] => {
    const byName = new Map<string, AddressHistoryEvent[]>()
    // One registration's charge is stated once across its rows.
    for (const row of withoutDuplicateCharges(rows)) {
      const events = toEvent(row)
      if (events.length === 0) continue
      const key = row.name ?? ''
      byName.set(key, [...(byName.get(key) ?? []), ...events])
    }
    return [...byName].map(([name, events]) => ({
      // A record write bigname could not attribute to a name has none.
      name: name || null,
      registrarHolder: name && heldNames.has(name) ? address : null,
      events,
    }))
  })

const getAddressHistoryQueryKey = createQueryKey<
  'get-address-history',
  GetAddressHistoryParameters
>('get-address-history')

export const getAddressHistoryQueryOptions = (
  params: GetAddressHistoryParameters,
) =>
  resultQueryOptions({
    queryKey: getAddressHistoryQueryKey(params),
    queryFn: ({ queryKey: [, params], signal }) =>
      getAddressHistory(params, signal),
  })
