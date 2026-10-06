import {
  type AddressName,
  type AddressNamesQuery,
  type AddressNamesResponse,
  type BignameClient,
  type BignameError,
  isStale,
  readNamesForAddress,
} from '@ens-apps/indexer/bigname'
import type { ReadNamesForAddress } from '@ens-apps/indexer/reads'
import { V2_GRACE_PERIOD_DAYS } from '@ens-apps/utils/gracePeriod'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { skipToken } from '@tanstack/react-query'
import { errAsync, ok, ResultAsync } from 'neverthrow'
import type { Address } from 'viem'
import { readAllNames } from '@/features/shared/service/readNamePages'
import { bigname } from '@/lib/bigname'
import {
  isListedName,
  mergeDashboardNames,
  toDashboardName,
  toGraceName,
} from '../../dashboardNames'

const FETCH_PAGE_SIZE = 200
const SECONDS_PER_DAY = 86_400

export class GetDashboardNamesError extends TaggedError(
  'GetDashboardNamesError',
)<{
  cause: unknown
}> {}

const getCurrentNames = (readNames: ReadNamesForAddress, address: Address) =>
  readAllNames(readNames, { address, sort: 'name', order: 'asc' })
    .map((names) => names.filter(isListedName).map(toDashboardName))
    .mapErr((error) => new GetDashboardNamesError({ cause: error }))

const MAX_STALE_ATTEMPTS = 3

// bigname's cursors hold no snapshot, so a stale page is sent again as is.
const readGracePage = (
  addressNames: BignameClient['addressNames'],
  address: Address,
  query: AddressNamesQuery,
  attemptsLeft = MAX_STALE_ATTEMPTS,
): ResultAsync<AddressNamesResponse, BignameError> =>
  addressNames(address, query).orElse((error) =>
    isStale(error) && attemptsLeft > 1
      ? readGracePage(addressNames, address, query, attemptsLeft - 1)
      : errAsync(error),
  )

/** `relation=any` drops an ENSv2 name once it expires, but it stays renewable through grace. */
const getGraceNames = ResultFn(async function* (
  addressNames: BignameClient['addressNames'],
  address: Address,
  now: Date,
) {
  const nowSeconds = Math.floor(now.getTime() / 1000)
  let rows: readonly AddressName[] = []
  let cursor: string | null = null
  do {
    const query: AddressNamesQuery = {
      namespace: 'ens',
      relation: 'former_owner',
      parent: 'eth',
      sort: 'expires_at',
      order: 'asc',
      expires_after: String(
        nowSeconds - V2_GRACE_PERIOD_DAYS * SECONDS_PER_DAY,
      ),
      expires_before: String(nowSeconds + 1),
      page_size: FETCH_PAGE_SIZE,
      ...(cursor !== null && { cursor }),
    }
    const page: AddressNamesResponse = yield* readGracePage(
      addressNames,
      address,
      query,
    ).mapErr((error) => new GetDashboardNamesError({ cause: error }))
    rows = [...rows, ...page.data]
    cursor = page.page?.next_cursor ?? null
  } while (cursor !== null)
  return ok(rows.flatMap((row) => toGraceName(row, address, now) ?? []))
})

/** Every name the connected addresses own or manage, plus their ENSv2 names in grace. */
export const getDashboardNames = ResultFn(async function* (
  readNames: ReadNamesForAddress,
  addressNames: BignameClient['addressNames'],
  addresses: readonly Address[],
  now: Date = new Date(),
) {
  const collections = yield* ResultAsync.combine(
    addresses.flatMap((address) => [
      getCurrentNames(readNames, address),
      getGraceNames(addressNames, address, now),
    ]),
  )
  return ok(mergeDashboardNames(collections.flat()))
})

export const getDashboardNamesQueryOptions = (addresses: readonly Address[]) =>
  resultQueryOptions({
    queryKey: qk('dashboard', 'names', {
      addresses: addresses.map((address) => address.toLowerCase()),
    }),
    queryFn:
      addresses.length > 0
        ? () =>
            getDashboardNames(
              readNamesForAddress(bigname),
              bigname.addressNames,
              addresses,
            )
        : skipToken,
    meta: {
      dependsOn: ['indexer'],
    },
  })
