import {
  type AddressNameRow,
  fetchAllPages,
  MAX_PAGE_SIZE,
} from '@ens-apps/bigname'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import { bigname } from '@/lib/bigname'
import type { ForwardName } from '../ForwardNamesTable/columns'

export class GetResolvedNamesForAddressError extends TaggedError(
  'GetResolvedNamesForAddressError',
)<{
  cause: unknown
}> {}

type GetResolvedNamesForAddressParameters = {
  address: Address
}

/**
 * A name row with the EVM coin types whose stored `addr` record holds the
 * address (`resolutions`), as the forward-resolution table renders it.
 */
const toForwardNames = (rows: readonly AddressNameRow[]): ForwardName[] =>
  rows.map((row) => ({
    name: row.name,
    coinTypes: (row.resolutions ?? []).map(({ coin_type }) =>
      String(coin_type),
    ),
  }))

/**
 * Names whose resolver records point at the address on Ethereum or any EVM
 * chain (coin 60 and every ENSIP-11 coin type, including the ENSIP-19 default
 * record). Non-EVM coin types are not searched.
 */
export const getResolvedNamesForAddress = ResultFn(async function* ({
  address,
}: GetResolvedNamesForAddressParameters) {
  const { rows } = yield* fromPromise(
    fetchAllPages((cursor) =>
      bigname.listAddressNames(address, {
        namespace: 'ens',
        relation: 'resolves_to',
        coin_type: 'evm',
        sort: 'name',
        page_size: MAX_PAGE_SIZE,
        cursor,
      }),
    ),
    (e) => new GetResolvedNamesForAddressError({ cause: e }),
  )

  return ok(toForwardNames(rows))
})

export const getResolvedNamesForAddressQueryKey = createQueryKey<
  'get-resolved-names-for-address',
  GetResolvedNamesForAddressParameters
>('get-resolved-names-for-address')

export const getResolvedNamesForAddressQueryOptions = (
  params: GetResolvedNamesForAddressParameters,
) =>
  resultQueryOptions({
    queryKey: getResolvedNamesForAddressQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getResolvedNamesForAddress(params),
  })
