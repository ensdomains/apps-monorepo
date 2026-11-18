import type { IndexerReadError } from '@ens-apps/indexer/reads'
import { readAllNames } from '@ens-apps/indexer/reads'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { okAsync, ResultAsync } from 'neverthrow'
import type { Address } from 'viem'
import { indexer } from '@/lib/indexer'
import {
  type AddressNameItem,
  byShownExpiry,
  ethParentOf,
  mergeAddressNames,
  toAddressNameItem,
  toLapsedItem,
} from '@/utils/names/addressNames'
import { readLapsedNames } from '@/utils/names/lapsedNames'
import { toValidDate } from '@/utils/temporal'

class GetAddressNamesError extends TaggedError('GetAddressNamesError')<{
  cause: IndexerReadError
}> {}

type GetAddressNamesParameters = { readonly address: Address }

const toError = (cause: IndexerReadError) => new GetAddressNamesError({ cause })

/** The indexer's `getNames` batch limit. */
const LOOKUP_BATCH_SIZE = 1000

const toBatches = <T>(items: readonly T[]): readonly (readonly T[])[] =>
  Array.from({ length: Math.ceil(items.length / LOOKUP_BATCH_SIZE) }, (_, i) =>
    items.slice(i * LOOKUP_BATCH_SIZE, (i + 1) * LOOKUP_BATCH_SIZE),
  )

type ParentExpiry = readonly [name: string, expiry: Date | null]

/** One lookup's parent expiries; a failed read leaves those dates unknown. */
const readParentExpiries = (
  names: readonly string[],
  signal?: AbortSignal,
): ResultAsync<readonly ParentExpiry[], never> =>
  indexer
    .getNames({ names }, { signal })
    .map((details) =>
      names.map(
        (name, index): ParentExpiry => [
          name,
          toValidDate(details[index]?.expiresAt),
        ],
      ),
    )
    .orElse(() => okAsync([]))

/**
 * Gives each ENSv1 subname its `.eth` parent's expiry. Parents already listed
 * are reused; the rest are looked up in batches.
 */
const withParentExpiry = (
  items: readonly AddressNameItem[],
  signal?: AbortSignal,
): ResultAsync<AddressNameItem[], never> => {
  const listed = new Map(items.map((item) => [item.name, item.expiryDate]))
  const missing = [
    ...new Set(items.flatMap((item) => ethParentOf(item) ?? [])),
  ].filter((parent) => !listed.get(parent))

  return ResultAsync.combine(
    toBatches(missing).map((batch) => readParentExpiries(batch, signal)),
  ).map((batches) => {
    const expiryOf = new Map([...listed, ...batches.flat()])
    return items.map((item) => {
      const parent = ethParentOf(item)
      return parent
        ? { ...item, parentExpiryDate: expiryOf.get(parent) ?? null }
        : item
    })
  })
}

/**
 * Every name the address owns, manages or holds a role on, in either era,
 * plus the names it let expire in the last 30 days. Names that only resolve
 * to the address are on its resolution page instead.
 */
export const getAddressNames = (
  { address }: GetAddressNamesParameters,
  {
    now = Temporal.Now.instant(),
    signal,
  }: Readonly<{ now?: Temporal.Instant; signal?: AbortSignal }> = {},
) =>
  ResultAsync.combine([
    readAllNames(
      indexer.getNamesForAddress,
      { address, includeCounts: true },
      { signal },
    ).mapErr(toError),
    readLapsedNames(address, new Date(now.epochMilliseconds), signal).mapErr(
      toError,
    ),
  ])
    .map(([summaries, lapsed]) =>
      mergeAddressNames(
        summaries.flatMap((summary) => toAddressNameItem(summary) ?? []),
        lapsed.map(toLapsedItem),
      ),
    )
    .andThen((items) => withParentExpiry(items, signal))
    .map((items) => items.toSorted(byShownExpiry))

export const getAddressNamesQueryKey = createQueryKey<
  'get-address-names',
  GetAddressNamesParameters
>('get-address-names')

export const getAddressNamesQueryOptions = (
  params: GetAddressNamesParameters,
) =>
  resultQueryOptions({
    queryKey: getAddressNamesQueryKey(params),
    queryFn: ({ queryKey: [, params], signal }) =>
      getAddressNames(params, { signal }),
  })
