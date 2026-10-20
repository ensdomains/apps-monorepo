import type { BignameError } from '@ens-apps/indexer/bigname'
import { readNamesForAddress } from '@ens-apps/indexer/bigname'
import type { IndexerReadError } from '@ens-apps/indexer/reads'
import { readAllNames } from '@ens-apps/indexer/reads'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { ResultAsync } from 'neverthrow'
import type { Address } from 'viem'
import { bigname } from '@/lib/bigname'
import {
  mergeAddressNames,
  toAddressNameItem,
  toLapsedItem,
} from '@/utils/names/addressNames'
import { readLapsedNames } from '@/utils/names/lapsedNames'

class GetAddressNamesError extends TaggedError('GetAddressNamesError')<{
  cause: BignameError | IndexerReadError
}> {}

type GetAddressNamesParameters = { readonly address: Address }

const NS_PER_SECOND = 1_000_000_000n

const toError = (cause: BignameError | IndexerReadError) =>
  new GetAddressNamesError({ cause })

const readNames = readNamesForAddress(bigname)

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
  ]).map(([summaries, lapsedRows]) =>
    mergeAddressNames(
      summaries.flatMap((summary) => toAddressNameItem(summary) ?? []),
      lapsedRows.map(toLapsedItem),
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
    queryFn: ({ queryKey: [, params], signal }) =>
      getAddressNames(params, { signal }),
  })
