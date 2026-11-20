import { type IndexerReadError, retryStaleRead } from '@ens-apps/indexer/reads'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { okAsync, type ResultAsync } from 'neverthrow'
import type { Address } from 'viem'
import { indexer } from '@/lib/indexer'

class GetRegistryOccupantsError extends TaggedError(
  'GetRegistryOccupantsError',
)<{
  cause: IndexerReadError
}> {}

type GetRegistryOccupantsParameters = {
  readonly address: Address
  /** Whoever is about to write; every other holder in the registry is a third party. */
  readonly account: Address
}

/**
 * Who lives in a registry, relative to the account about to act on it. Used
 * before a write that detaches the registry: the labels inside are the names
 * that stop resolving, and the ones held by anyone else are third parties who
 * get no say and no repair path.
 *
 * Both numbers cover every label rather than a sample: `thirdPartyCount`
 * gates a destructive write, so a paged sample that missed the one stranger
 * in a large registry would answer it wrongly.
 */
export type RegistryOccupants = {
  readonly count: number
  readonly thirdPartyCount: number
}

/** A one-row page read for its `totalCount`; null when the indexer cannot count it. */
const countLabels = (
  address: Address,
  filter: { readonly excludeOwner?: Address },
) =>
  retryStaleRead((signal) =>
    indexer.getRegistryLabels({ address, ...filter, pageSize: 1 }, { signal }),
  ).map((page) => page?.totalCount ?? null)

/**
 * A complete first page gives both counts in one read. When the registry is
 * larger, use its exact total and ask for the exact other-owner count; never
 * infer that count from a sample. Ownerless labels are third parties too.
 *
 * Always read a fresh page here rather than reusing the registry-list cache:
 * an old empty page must not let a destructive detach bypass its guard.
 * Counts the indexer declines to give, or a registry it has not indexed yet,
 * remain unknown to the caller.
 */
const getRegistryOccupants = ({
  address,
  account,
}: GetRegistryOccupantsParameters) =>
  retryStaleRead((signal) =>
    indexer.getRegistryLabels({ address, pageSize: 200 }, { signal }),
  )
    .andThen(
      (page): ResultAsync<RegistryOccupants | null, IndexerReadError> => {
        const count = page?.totalCount ?? null
        if (!page || count === null) return okAsync(null)
        if (page.nextCursor === null && page.items.length === count) {
          return okAsync({
            count,
            thirdPartyCount: page.items.filter(
              (label) => label.owner?.toLowerCase() !== account.toLowerCase(),
            ).length,
          })
        }
        return countLabels(address, {
          excludeOwner: account.toLowerCase() as Address,
        }).map((thirdPartyCount) =>
          thirdPartyCount === null ? null : { count, thirdPartyCount },
        )
      },
    )
    .mapErr((cause) => new GetRegistryOccupantsError({ cause }))

export const getRegistryOccupantsQueryKey = createQueryKey<
  'get-registry-occupants',
  GetRegistryOccupantsParameters
>('get-registry-occupants')

export const getRegistryOccupantsQueryOptions = (
  params: GetRegistryOccupantsParameters,
) =>
  resultQueryOptions({
    queryKey: getRegistryOccupantsQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getRegistryOccupants(params),
  })
