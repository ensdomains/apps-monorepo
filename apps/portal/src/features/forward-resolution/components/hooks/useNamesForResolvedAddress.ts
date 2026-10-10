import type { AddressName, LookupRecord } from '@ens-apps/indexer/bigname'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { err, ok } from 'neverthrow'
import type { Address } from 'viem'
import { bigname } from '@/lib/bigname'
import type { ForwardName } from '../ForwardNamesTable/columns'

class GetResolvedNamesForAddressError extends TaggedError(
  'GetResolvedNamesForAddressError',
)<{
  cause: unknown
}> {}

/** More names than bigname will list for one address record. */
export class TooManyResolvedNamesError extends TaggedError(
  'TooManyResolvedNamesError',
)<{
  cause: unknown
}> {}

type GetResolvedNamesForAddressParameters = { readonly address: Address }

// bigname answers 422 past 100 matches.
const MAX_RESOLVED_NAMES = 100

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
  const matched = (row.resolutions ?? []).map(({ coin_type }) =>
    String(coin_type),
  )
  return Array.from(new Set([...matched, ...set]))
}

/**
 * The names whose address record on any EVM network, or the default EVM
 * record, holds this address, with the networks each has an address for.
 * bigname matches the stored record value.
 */
export const getResolvedNamesForAddress = ResultFn(async function* ({
  address,
}: GetResolvedNamesForAddressParameters) {
  const { data: rows } = yield* bigname
    .addressNames(address, {
      namespace: 'ens',
      relation: 'resolves_to',
      coin_type: 'evm',
      sort: 'name',
      order: 'asc',
      page_size: MAX_RESOLVED_NAMES,
    })
    .mapErr((cause) =>
      cause.code === 'unsupported'
        ? new TooManyResolvedNamesError({ cause })
        : new GetResolvedNamesForAddressError({ cause }),
    )
  if (rows.length === 0) return ok<ForwardName[]>([])

  const { data: details } = yield* bigname
    .lookup({
      namespace: 'ens',
      profile: 'detail',
      inputs: rows.map(({ name }) => ({ name })),
    })
    .mapErr((cause) => new GetResolvedNamesForAddressError({ cause }))
  if (details.length !== rows.length)
    return err(
      new GetResolvedNamesForAddressError({
        cause: new Error('bigname answered a different number of names'),
      }),
    )

  return ok<ForwardName[]>(
    rows.map((row, index) => ({
      name: row.name,
      coinTypes: coinTypesOf(row, details[index]?.record),
    })),
  )
})

const getResolvedNamesForAddressQueryKey = createQueryKey<
  'get-resolved-names-for-address',
  GetResolvedNamesForAddressParameters
>('get-resolved-names-for-address')

export const getResolvedNamesForAddressQueryOptions = (
  params: GetResolvedNamesForAddressParameters,
) =>
  resultQueryOptions({
    queryKey: getResolvedNamesForAddressQueryKey(params),
    queryFn: () => getResolvedNamesForAddress(params),
  })
