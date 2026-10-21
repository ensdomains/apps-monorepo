import type { BignameError } from '@ens-apps/indexer/bigname'
import { readNamesForAddress, toDate } from '@ens-apps/indexer/bigname'
import type { IndexerReadError } from '@ens-apps/indexer/reads'
import { readAllNames } from '@ens-apps/indexer/reads'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { okAsync, ResultAsync } from 'neverthrow'
import type { Address } from 'viem'
import { bigname } from '@/lib/bigname'
import {
  type AddressNameItem,
  ethParentOf,
  mergeAddressNames,
  toAddressNameItem,
  toLapsedItem,
} from '@/utils/names/addressNames'
import { readLapsedNames } from '@/utils/names/lapsedNames'
import { toValidDate } from '@/utils/temporal'

class GetAddressNamesError extends TaggedError('GetAddressNamesError')<{
  cause: BignameError | IndexerReadError
}> {}

type GetAddressNamesParameters = { readonly address: Address }

const NS_PER_SECOND = 1_000_000_000n

const toError = (cause: BignameError | IndexerReadError) =>
  new GetAddressNamesError({ cause })

const readNames = readNamesForAddress(bigname)

/**
 * Gives each ENSv1 subname its `.eth` parent's expiry. Parents already listed
 * are reused; the rest are read in one lookup. A failed read leaves the date
 * out rather than failing the list.
 */
const withParentExpiry = (
  items: readonly AddressNameItem[],
  signal?: AbortSignal,
): ResultAsync<AddressNameItem[], never> => {
  const listed = new Map(items.map((item) => [item.name, item.expiryDate]))
  const missing = [
    ...new Set(items.flatMap((item) => ethParentOf(item) ?? [])),
  ].filter((parent) => !listed.get(parent))

  const expiries =
    missing.length === 0
      ? okAsync(listed)
      : bigname
          .lookup(
            {
              namespace: 'ens',
              profile: 'feed',
              inputs: missing.map((name) => ({ name })),
            },
            { signal },
          )
          .map(
            ({ data }) =>
              new Map([
                ...listed,
                ...missing.map((name, index) => {
                  const record = data[index]?.record
                  const expiresAt =
                    record?.ens_v1?.expires_at ?? record?.expires_at
                  return [name, toValidDate(toDate(expiresAt))] as const
                }),
              ]),
          )
          .orElse(() => okAsync(listed))

  return expiries.map((expiryOf) =>
    items.map((item) => {
      const parent = ethParentOf(item)
      return parent
        ? { ...item, parentExpiryDate: expiryOf.get(parent) ?? null }
        : item
    }),
  )
}

/**
 * Every name the address owns, manages or holds a role on, in either era,
 * plus the names it held through their grace and price cooldown. Names that only resolve
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
      readNames,
      { address, includeCounts: true },
      { signal },
    ).mapErr(toError),
    readLapsedNames(
      bigname,
      address,
      now.epochNanoseconds / NS_PER_SECOND,
      signal,
    ).mapErr(toError),
  ])
    .map(([summaries, lapsedRows]) =>
      mergeAddressNames(
        summaries.flatMap((summary) => toAddressNameItem(summary) ?? []),
        lapsedRows.map(toLapsedItem),
      ),
    )
    .andThen((items) => withParentExpiry(items, signal))

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
