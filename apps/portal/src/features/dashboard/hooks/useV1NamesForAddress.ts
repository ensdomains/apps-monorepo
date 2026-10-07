import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import {
  resultInfiniteQueryOptions,
  resultQueryOptions,
} from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import type {
  GetNamesForAddressErrorType,
  GetNamesForAddressParameters,
  GetNamesForAddressReturnType,
} from '@ensdomains/ensjs/subgraph'
import { getNamesForAddress as ensjs_getNamesForAddress } from '@ensdomains/ensjs/subgraph'
import { fromPromise, ok } from 'neverthrow'
import { safeGetClient } from '@/lib/wagmi/helpers'

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

const getV1NamesForAddressQueryKey = createQueryKey<
  'get-names-for-address',
  GetNamesForAddressParameters
>('get-names-for-address')

export const getV1NamesForAddressQueryOptions = (
  params: GetNamesForAddressParameters,
) =>
  resultQueryOptions({
    queryKey: getV1NamesForAddressQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getV1NamesForAddress(params),
  })

const V1_NAMES_PAGE_SIZE = 100

type V1NamesPage = {
  readonly names: GetNamesForAddressReturnType
  readonly hasNextPage: boolean
}

const getV1NamesPagesForAddressQueryKey = createQueryKey<
  'get-names-for-address',
  Pick<GetNamesForAddressParameters, 'address'> & { readonly only: 'pages' }
>('get-names-for-address')

export const getV1NamesPagesForAddressQueryOptions = ({
  address,
}: Pick<GetNamesForAddressParameters, 'address'>) =>
  resultInfiniteQueryOptions({
    queryKey: getV1NamesPagesForAddressQueryKey({ address, only: 'pages' }),
    queryFn: ({ pageParam }) =>
      getV1NamesForAddress({
        address,
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
