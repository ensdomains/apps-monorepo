import type { BignameError } from '@ens-apps/indexer/bigname'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { okAsync, type ResultAsync } from 'neverthrow'
import type { Address } from 'viem'
import { envConfig } from '@/config'
import { bigname } from '@/lib/bigname'
import { nullOnNotFound } from '@/utils/bigname/nullOnNotFound'

class GetRegistryOccupantsError extends TaggedError(
  'GetRegistryOccupantsError',
)<{
  cause: unknown
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

/** A one-row page read for its `total_count`; null when bigname did not count it. */
const countLabels = (
  address: Address,
  filter: { readonly exclude_owner?: string },
) =>
  nullOnNotFound(
    bigname.registryLabels(envConfig.chain.id, address.toLowerCase(), {
      ...filter,
      page_size: 1,
    }),
  ).map((page) => (page ? (page.page?.total_count ?? null) : 0))

/**
 * A complete first page gives both counts in one read. When the registry is
 * larger, use its exact total and ask for the exact other-owner count; never
 * infer that count from a sample. Ownerless labels are third parties too.
 *
 * Always read a fresh page here rather than reusing the registry-list cache:
 * an old empty page must not let a destructive detach bypass its guard.
 * Counts bigname declines to give remain unknown to the caller.
 */
const getRegistryOccupants = ({
  address,
  account,
}: GetRegistryOccupantsParameters) =>
  nullOnNotFound(
    bigname.registryLabels(envConfig.chain.id, address.toLowerCase(), {
      page_size: 200,
    }),
  )
    .andThen((page): ResultAsync<RegistryOccupants | null, BignameError> => {
      if (!page) return okAsync({ count: 0, thirdPartyCount: 0 })
      const count = page.page?.total_count ?? null
      if (count === null) return okAsync(null)
      if (!page.page?.has_more && page.data.length === count) {
        return okAsync({
          count,
          thirdPartyCount: page.data.filter(
            (label) => label.owner?.toLowerCase() !== account.toLowerCase(),
          ).length,
        })
      }
      return countLabels(address, {
        exclude_owner: account.toLowerCase(),
      }).map((thirdPartyCount) =>
        thirdPartyCount === null ? null : { count, thirdPartyCount },
      )
    })
    .mapErr((cause) => new GetRegistryOccupantsError({ cause }))

const getRegistryOccupantsQueryKey = createQueryKey<
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
