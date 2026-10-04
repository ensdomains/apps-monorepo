import {
  type BignameError,
  fetchAllPages,
  type HistoryEvent,
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
   * history is paged up to `ADDRESS_HISTORY_MAX_ROWS`.
   */
  readonly pageSize?: number
}

/** Bound on a full read: an address's history is attacker-inflatable. */
const ADDRESS_HISTORY_MAX_ROWS = 1000
/** Bound on the names read that supplies each name's relations. */
const ADDRESS_NAMES_MAX_ROWS = 1000

const readHistory = async (address: Address, pageSize: number | undefined) => {
  const read = (cursor: string | undefined, page_size: number) =>
    bigname.getAddressHistory(address.toLowerCase(), {
      relation: 'any',
      include: ['data', 'raw'],
      order: 'desc',
      page_size,
      cursor,
    })
  if (pageSize !== undefined) return (await read(undefined, pageSize)).data
  const { rows } = await fetchAllPages(
    (cursor) => read(cursor, MAX_PAGE_SIZE),
    { maxRows: ADDRESS_HISTORY_MAX_ROWS },
  )
  return rows
}

/**
 * The names the address holds the token of, from a `relation=any` names read:
 * `registrant` for an ENSv1 `.eth` 2LD (or its NameWrapper holder), `owner` for
 * an ENSv2 token holder. A `manager` relation alone is the registry controller,
 * which any parent owner can assign, so it does not count.
 */
const readHeldNames = async (address: Address): Promise<Set<string>> => {
  const { rows } = await fetchAllPages(
    (cursor) =>
      bigname.listAddressNames(address.toLowerCase(), {
        relation: 'any',
        page_size: MAX_PAGE_SIZE,
        cursor,
      }),
    { maxRows: ADDRESS_NAMES_MAX_ROWS },
  )
  return new Set(
    rows
      .filter(
        ({ relations }) =>
          relations.includes('registrant') || relations.includes('owner'),
      )
      .map(({ name }) => name),
  )
}

const toEvent = (row: HistoryEvent): AddressHistoryEvent[] => {
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
 * An address's history, one bigname stream over every name it is or was the
 * owner, manager or registrant of, ENSv1 and ENSv2 alike, grouped by name.
 *
 * Grouped rather than flat because whether a name's history is the address's
 * own is decided per name (see `nameAttribution.ts`), and that needs each
 * name's provenance: `registrarHolder` is the address when it holds the name's
 * token, read from the names list since history rows carry no relations.
 */
const getAddressHistory = ({
  address,
  pageSize,
}: GetAddressHistoryParameters) =>
  fromPromise(
    Promise.all([readHistory(address, pageSize), readHeldNames(address)]),
    (e) => new GetAddressHistoryError({ cause: e as BignameError }),
  ).map(([rows, heldNames]): AddressNameHistory[] => {
    const byName = new Map<string, AddressHistoryEvent[]>()
    for (const row of rows) {
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
    queryFn: ({ queryKey: [, params] }) => getAddressHistory(params),
  })
