import {
  type AddressName,
  type BignameError,
  isStale,
  type LookupRecord,
  retryStale,
} from '@ens-apps/indexer/bigname'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultInfiniteQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { err, ok } from 'neverthrow'
import type { Address } from 'viem'
import { bigname } from '@/lib/bigname'
import type { ForwardName } from '../ForwardNamesTable/columns'

class GetResolvedNamesForAddressError extends TaggedError(
  'GetResolvedNamesForAddressError',
)<{
  cause: BignameError | Error
}> {}

type GetResolvedNamesForAddressParameters = { readonly address: Address }

/** Every EVM network, or Ethereum alone once a name matched too many. */
type ResolvedCoinType = 'evm' | 60

type ResolvedNamesPageParam = Readonly<{
  cursor?: string
  coinType: ResolvedCoinType
}>

type ResolvedNamesPage = Readonly<{
  names: readonly ForwardName[]
  next: ResolvedNamesPageParam | null
  /** The list matches Ethereum (coin type 60) address records only. */
  isEthereumOnly: boolean
}>

export const RESOLVED_NAMES_PAGE_SIZE = 100

const FIRST_PAGE: ResolvedNamesPageParam = { coinType: 'evm' }

// The networks a name has an address for, cleared ones excluded, with the
// ones that matched this address always among them.
const coinTypesOf = (
  row: AddressName,
  record: LookupRecord | undefined,
): string[] => {
  const groups = record?.records
  const set = (groups?.seen_addresses ?? []).filter(
    (coinType) => groups?.addresses[coinType] !== null,
  )
  const matched = [
    ...(row.resolutions ?? []),
    ...(row.resolution ? [row.resolution] : []),
  ].map(({ coin_type }) => String(coin_type))
  return Array.from(new Set([...matched, ...set]))
}

const readPage = (
  address: Address,
  { cursor, coinType }: ResolvedNamesPageParam,
  signal: AbortSignal | undefined,
) =>
  retryStale(
    (requestSignal) =>
      bigname.addressNames(
        address,
        {
          namespace: 'ens',
          relation: 'resolves_to',
          coin_type: coinType,
          sort: 'name',
          order: 'asc',
          page_size: RESOLVED_NAMES_PAGE_SIZE,
          ...(cursor && { cursor }),
        },
        { signal: requestSignal },
      ),
    isStale,
    { signal },
  )

/**
 * One page of the names whose address record on any EVM network, or the
 * default EVM record, holds this address, with the networks each has an
 * address for. bigname matches the stored record value.
 *
 * An `evm` read answers 422 when one name on the page stores the address
 * under more than 100 coin types. The list then falls back to Ethereum
 * address records, from the first page; past the first page it can't, since
 * the rows already shown came from the wider read.
 */
export const getResolvedNamesPage = ResultFn(async function* (
  { address }: GetResolvedNamesForAddressParameters,
  param: ResolvedNamesPageParam,
  signal?: AbortSignal,
) {
  const listed = await readPage(address, param, signal)
  const isFallback =
    listed.isErr() &&
    listed.error.code === 'unsupported' &&
    param.coinType === 'evm' &&
    param.cursor === undefined
  const coinType: ResolvedCoinType = isFallback ? 60 : param.coinType
  const { data: rows, page } = yield* (
    isFallback ? readPage(address, { coinType }, signal) : listed
  ).mapErr((cause) => new GetResolvedNamesForAddressError({ cause }))

  const next: ResolvedNamesPageParam | null =
    page?.has_more && page.next_cursor
      ? { cursor: page.next_cursor, coinType }
      : null
  const isEthereumOnly = coinType === 60
  if (rows.length === 0)
    return ok<ResolvedNamesPage>({ names: [], next, isEthereumOnly })

  const { data: details } = yield* bigname
    .lookup(
      {
        namespace: 'ens',
        profile: 'detail',
        inputs: rows.map(({ name }) => ({ name })),
      },
      { signal },
    )
    .mapErr((cause) => new GetResolvedNamesForAddressError({ cause }))
  if (details.length !== rows.length)
    return err(
      new GetResolvedNamesForAddressError({
        cause: new Error('bigname answered a different number of names'),
      }),
    )

  return ok<ResolvedNamesPage>({
    names: rows.map((row, index) => ({
      name: row.name,
      coinTypes: coinTypesOf(row, details[index]?.record),
    })),
    next,
    isEthereumOnly,
  })
})

const getResolvedNamesForAddressQueryKey = createQueryKey<
  'get-resolved-names-for-address',
  GetResolvedNamesForAddressParameters
>('get-resolved-names-for-address')

export const getResolvedNamesForAddressQueryOptions = (
  params: GetResolvedNamesForAddressParameters,
) =>
  resultInfiniteQueryOptions({
    queryKey: getResolvedNamesForAddressQueryKey(params),
    queryFn: ({ queryKey: [, params], pageParam, signal }) =>
      getResolvedNamesPage(params, pageParam, signal),
    initialPageParam: FIRST_PAGE,
    getNextPageParam: (last: ResolvedNamesPage) => last.next ?? undefined,
  })
