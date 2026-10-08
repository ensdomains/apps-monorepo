import {
  type EventRow,
  MAX_PAGE_SIZE,
  readNamesForAddress,
  timestampToSeconds,
} from '@ens-apps/indexer/bigname'
import { readAllNames } from '@ens-apps/indexer/reads'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { ResultAsync } from 'neverthrow'
import type { Address } from 'viem'
import { bigname } from '@/lib/bigname'
import { readAllPages } from '@/utils/bigname/readAllPages'
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
  cause: unknown
}> {}

type GetAddressHistoryParameters = {
  readonly address: Address
  /**
   * Read one page of this many rows — the recent-history teaser. Omitted, the
   * history is read through the final page.
   */
  readonly pageSize?: number
}

const toError = (cause: unknown) => new GetAddressHistoryError({ cause })

const readHistoryPage = (address: Address, pageSize: number, cursor?: string) =>
  bigname.addressHistory(address.toLowerCase(), {
    relation: 'any',
    include: ['data', 'raw'],
    order: 'desc',
    page_size: pageSize,
    ...(cursor && { cursor }),
  })

const readHistory = (address: Address, pageSize: number | undefined) =>
  (pageSize !== undefined
    ? readHistoryPage(address, pageSize).map(({ data }) => data)
    : readAllPages<EventRow>((cursor) =>
        readHistoryPage(address, MAX_PAGE_SIZE, cursor),
      )
  ).mapErr(toError)

/**
 * The names the address holds the token of, from a `relation=owner` names read:
 * `owner` is the token holder (BaseRegistrar, NameWrapper or ENSv2 token; the
 * registry owner only for a tokenless subname, which `attributeName` never
 * treats as a root). A `manager` relation alone is the registry controller,
 * which any parent owner can assign, so it does not count.
 */
const readHeldNames = (address: Address) =>
  readAllNames(readNamesForAddress(bigname), {
    address,
    relations: ['owner'],
  })
    .map((names) => new Set(names.map(({ name }) => name)))
    .mapErr(toError)

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
const getAddressHistory = ({
  address,
  pageSize,
}: GetAddressHistoryParameters) =>
  ResultAsync.combine([
    readHistory(address, pageSize),
    readHeldNames(address),
  ]).map(([rows, heldNames]): AddressNameHistory[] => {
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
    queryFn: ({ queryKey: [, params] }) => getAddressHistory(params),
  })
