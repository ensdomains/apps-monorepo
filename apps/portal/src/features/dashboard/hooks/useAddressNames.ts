import type { BignameError } from '@ens-apps/indexer/bigname'
import { readGraceNames, readNamesForAddress } from '@ens-apps/indexer/bigname'
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
  toGraceItem,
} from '@/utils/names/addressNames'

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
 * plus the ENSv2 names it can still renew in grace. Names that only resolve
 * to the address are on its resolution page instead.
 */
export const getAddressNames = (
  { address }: GetAddressNamesParameters,
  now: Temporal.Instant = Temporal.Now.instant(),
) =>
  ResultAsync.combine([
    readAllNames(readNames, { address, includeCounts: true }).mapErr(toError),
    // bigname drops an ENSv2 name from `relation=any` once it expires, though
    // its holder can still renew it for 28 days.
    readGraceNames(
      bigname,
      address,
      now.epochNanoseconds / NS_PER_SECOND,
    ).mapErr(toError),
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
