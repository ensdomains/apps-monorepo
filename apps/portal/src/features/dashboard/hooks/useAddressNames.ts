import {
  type AddressName,
  type AddressNamesResponse,
  isInV2Grace,
  readNamesForAddress,
  V2_GRACE_SECONDS,
} from '@ens-apps/indexer/bigname'
import { readAllNames } from '@ens-apps/indexer/reads'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { errAsync, ok, ResultAsync } from 'neverthrow'
import type { Address } from 'viem'
import { bigname } from '@/lib/bigname'
import {
  mergeAddressNames,
  toAddressNameItem,
  toGraceItem,
} from '@/utils/names/addressNames'

class GetAddressNamesError extends TaggedError('GetAddressNamesError')<{
  cause: unknown
}> {}

type GetAddressNamesParameters = { readonly address: Address }

const PAGE_SIZE = 200
const NS_PER_SECOND = 1_000_000_000n

const toError = (cause: unknown) => new GetAddressNamesError({ cause })

// bigname drops an ENSv2 name from `relation=any` once it expires, though its
// holder can still renew it for 28 days.
const getGraceRows = ResultFn(async function* (
  address: Address,
  now: Temporal.Instant,
) {
  const nowSeconds = now.epochNanoseconds / NS_PER_SECOND
  let rows: readonly AddressName[] = []
  let cursor: string | null = null
  do {
    const page: AddressNamesResponse = yield* bigname
      .addressNames(address, {
        namespace: 'ens',
        relation: 'former_owner',
        parent: 'eth',
        sort: 'expires_at',
        order: 'asc',
        expires_after: String(nowSeconds - V2_GRACE_SECONDS),
        expires_before: String(nowSeconds + 1n),
        page_size: PAGE_SIZE,
        ...(cursor !== null && { cursor }),
      })
      .mapErr(toError)
    rows = [...rows, ...page.data]
    cursor = page.page?.next_cursor ?? null
  } while (cursor !== null)
  return ok(rows.filter((row) => isInV2Grace(row, address, nowSeconds)))
})

const readNames = readNamesForAddress(bigname)

// bigname refuses a page whose role grants pass its expansion budget, so such
// a list is read again without the counts rather than not at all.
const readCurrentNames = (address: Address) =>
  readAllNames(readNames, {
    address,
    includeCounts: true,
    includeRoles: true,
  }).orElse((error) =>
    error.kind === 'rejected'
      ? readAllNames(readNames, { address, includeCounts: true })
      : errAsync(error),
  )

/**
 * Every name the address owns, manages or holds a role on, in either era,
 * plus the ENSv2 names it can still renew in grace. Names that only resolve
 * to the address are on its resolution page instead.
 */
export const getAddressNames = (
  { address }: GetAddressNamesParameters,
  now: Temporal.Instant = Temporal.Now.instant(),
) =>
  ResultAsync.combine([
    readCurrentNames(address).mapErr(toError),
    getGraceRows(address, now),
  ]).map(([summaries, graceRows]) =>
    mergeAddressNames(
      summaries.flatMap((summary) => toAddressNameItem(summary) ?? []),
      graceRows.map(toGraceItem),
    ),
  )

export const getAddressNamesQueryKey = createQueryKey<
  'get-address-names',
  GetAddressNamesParameters
>('get-address-names')

export const getAddressNamesQueryOptions = (
  params: GetAddressNamesParameters,
) =>
  resultQueryOptions({
    queryKey: getAddressNamesQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getAddressNames(params),
  })
