import {
  type AddressNameRow,
  fetchAllPages,
  isBignameError,
  type ListAddressNamesParams,
  MAX_PAGE_SIZE,
} from '@ens-apps/bigname'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import { bigname } from '@/lib/bigname'
import { toAddressNameItems } from '@/utils/names/addressNames'

class GetAddressNamesError extends TaggedError('GetAddressNamesError')<{
  cause: unknown
}> {}

type GetAddressNamesParameters = {
  address: Address
}

const fetchRows = (
  address: Address,
  include: ListAddressNamesParams['include'],
) =>
  fetchAllPages((cursor) =>
    bigname.listAddressNames(address, {
      namespace: 'ens',
      relation: 'any',
      include,
      sort: 'expires_at',
      order: 'asc',
      page_size: MAX_PAGE_SIZE,
      cursor,
    }),
  )

/**
 * Every ENS name the address owns, manages or is registrant of, ENSv1 and
 * ENSv2 alike, with subname/record counts and the address's roles.
 *
 * `role_summary` answers `422 unsupported` when a page expands past bigname's
 * grant budget; the list is still worth showing then, just without role
 * badges, so the read falls back to counts only.
 */
const fetchAddressNames = async (
  address: Address,
): Promise<readonly AddressNameRow[]> => {
  try {
    return (await fetchRows(address, ['counts', 'role_summary'])).rows
  } catch (error) {
    if (!isBignameError(error, 'unsupported')) throw error
    return (await fetchRows(address, ['counts'])).rows
  }
}

const getAddressNames = ResultFn(async function* ({
  address,
}: GetAddressNamesParameters) {
  const rows = yield* fromPromise(
    fetchAddressNames(address),
    (e) => new GetAddressNamesError({ cause: e }),
  )
  return ok(toAddressNameItems(rows, address))
})

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
