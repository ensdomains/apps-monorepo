import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultInfiniteQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import type {
  GetNamesForAddressErrorType,
  GetNamesForAddressParameters,
  GetNamesForAddressReturnType,
} from '@ensdomains/ensjs/subgraph'
import { getNamesForAddress as ensjs_getNamesForAddress } from '@ensdomains/ensjs/subgraph'
import { fromPromise, ok } from 'neverthrow'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { escapeSearchWildcards } from '../utils/escapeSearchWildcards'
import { getOwnedNamesQueryKey } from './ownedNamesQueryKey'

class GetV1NamesForAddressError extends TaggedError(
  'GetV1NamesForAddressError',
)<{
  cause: GetNamesForAddressErrorType
}> {}

const getV1NamesForAddress = ResultFn(async function* (
  params: GetNamesForAddressParameters,
) {
  const client = yield* safeGetClient()

  const names = yield* await fromPromise(
    ensjs_getNamesForAddress(client, params),
    (e) =>
      new GetV1NamesForAddressError({
        cause: e as GetNamesForAddressErrorType,
      }),
  )
  return ok(names)
})

const V1_NAMES_PAGE_SIZE = 100

type V1NamesPage = {
  readonly names: GetNamesForAddressReturnType
  readonly hasNextPage: boolean
}

/** ENSv1 names of an address in pages, soonest expiry first. */
export const getV1NamesPagesForAddressQueryOptions = ({
  address,
  search,
}: Pick<GetNamesForAddressParameters, 'address'> & {
  readonly search?: string
}) =>
  resultInfiniteQueryOptions({
    queryKey: getOwnedNamesQueryKey({
      address,
      protocolVersion: 'ENSv1',
      search,
    }),
    queryFn: ({ pageParam }) =>
      getV1NamesForAddress({
        address,
        // The subgraph's `_contains` is case-sensitive and names are stored lowercase.
        filter: search
          ? {
              searchString: escapeSearchWildcards(search.toLowerCase()),
              searchType: 'name',
            }
          : undefined,
        orderBy: 'expiryDate',
        orderDirection: 'asc',
        previousPage: pageParam,
        pageSize: V1_NAMES_PAGE_SIZE,
      }).map(
        (names): V1NamesPage => ({
          names,
          hasNextPage: names.length === V1_NAMES_PAGE_SIZE,
        }),
      ),
    initialPageParam: undefined as GetNamesForAddressReturnType | undefined,
    // ensjs pages from the last row of the previous page.
    getNextPageParam: (last: V1NamesPage) =>
      last.hasNextPage ? last.names.slice(-1) : undefined,
  })
