import {
  type AddressName,
  type AddressNamesResponse,
  type BignameClient,
  readNamesForAddress,
} from '@ens-apps/indexer/bigname'
import type {
  NameSummary,
  Page,
  ReadNamesForAddress,
} from '@ens-apps/indexer/reads'
import { V2_GRACE_PERIOD_DAYS } from '@ens-apps/utils/gracePeriod'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { skipToken } from '@tanstack/react-query'
import { ok, ResultAsync } from 'neverthrow'
import type { Address } from 'viem'
import { bigname } from '@/lib/bigname'
import {
  type DashboardName,
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

const getCurrentNames = ResultFn(async function* (
  readNames: ReadNamesForAddress,
  address: Address,
) {
  let names: readonly DashboardName[] = []
  let cursor: string | null = null
  do {
    const page: Page<NameSummary> = yield* readNames({
      address,
      sort: 'name',
      order: 'asc',
      pageSize: FETCH_PAGE_SIZE,
      ...(cursor !== null && { cursor }),
    }).mapErr((error) => new GetDashboardNamesError({ cause: error }))
    names = [...names, ...page.items.filter(isListedName).map(toDashboardName)]
    cursor = page.nextCursor
  } while (cursor !== null)
  return ok(names)
})

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
    const page: AddressNamesResponse = yield* addressNames(address, {
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
    }).mapErr((error) => new GetDashboardNamesError({ cause: error }))
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

export const dashboardNamesQuery = (addresses: readonly Address[]) =>
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
