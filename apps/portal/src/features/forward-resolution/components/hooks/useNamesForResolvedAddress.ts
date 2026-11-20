import {
  type IndexerReadError,
  type NameDetail,
  type NameSummary,
  retryStaleRead,
} from '@ens-apps/indexer/reads'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultInfiniteQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { err, ok } from 'neverthrow'
import type { Address } from 'viem'
import { indexer } from '@/lib/indexer'
import type { ForwardName } from '../ForwardNamesTable/columns'

class GetResolvedNamesForAddressError extends TaggedError(
  'GetResolvedNamesForAddressError',
)<{
  cause: IndexerReadError | Error
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
  summary: NameSummary,
  detail: NameDetail | null | undefined,
): string[] => {
  const matched = (summary.resolvedCoinTypes ?? []).map(String)
  return Array.from(new Set([...matched, ...(detail?.addressCoinTypes ?? [])]))
}

const readPage = (
  address: Address,
  { cursor, coinType }: ResolvedNamesPageParam,
  signal: AbortSignal | undefined,
) =>
  retryStaleRead(
    (requestSignal) =>
      indexer.getNamesForAddress(
        {
          address,
          resolvesTo: true,
          coinType,
          sort: 'name',
          order: 'asc',
          pageSize: RESOLVED_NAMES_PAGE_SIZE,
          ...(cursor && { cursor }),
        },
        { signal: requestSignal },
      ),
    { signal },
  )

/**
 * One page of the names whose address record on any EVM network, or the
 * default EVM record, holds this address, with the networks each has an
 * address for. The indexer matches the stored record value.
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
    listed.error.kind === 'unsupported' &&
    param.coinType === 'evm' &&
    param.cursor === undefined
  const coinType: ResolvedCoinType = isFallback ? 60 : param.coinType
  const { items: rows, nextCursor } = yield* (
    isFallback ? readPage(address, { coinType }, signal) : listed
  ).mapErr((cause) => new GetResolvedNamesForAddressError({ cause }))

  const next: ResolvedNamesPageParam | null = nextCursor
    ? { cursor: nextCursor, coinType }
    : null
  const isEthereumOnly = coinType === 60
  if (rows.length === 0)
    return ok<ResolvedNamesPage>({ names: [], next, isEthereumOnly })

  const details = yield* indexer
    .getNames({ names: rows.map(({ name }) => name) }, { signal })
    .mapErr((cause) => new GetResolvedNamesForAddressError({ cause }))
  if (details.length !== rows.length)
    return err(
      new GetResolvedNamesForAddressError({
        cause: new Error('the indexer answered a different number of names'),
      }),
    )

  return ok<ResolvedNamesPage>({
    names: rows.map((row, index) => ({
      name: row.name,
      coinTypes: coinTypesOf(row, details[index]),
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
