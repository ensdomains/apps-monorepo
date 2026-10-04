import { type BignameError, nullOnNotFound } from '@ens-apps/bigname'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { fromPromise } from 'neverthrow'
import type { Address } from 'viem'
import { bigname } from '@/lib/bigname'
import { sepoliaWithEns } from '@/lib/wagmi'

class GetRegistryOccupantsError extends TaggedError(
  'GetRegistryOccupantsError',
)<{
  cause: BignameError
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
 * Both numbers are bigname's exact counts over every label rather than a
 * sample: `thirdPartyCount` gates a destructive write, so a paged sample that
 * missed the one stranger in a large registry would answer it wrongly.
 */
export type RegistryOccupants = {
  readonly count: number
  readonly thirdPartyCount: number
}

/** A one-row page read for its `total_count`; `null` when bigname did not count it. */
const countLabels = (
  address: Address,
  filter: { readonly exclude_owner?: string },
) =>
  nullOnNotFound(
    bigname.listRegistryLabels(sepoliaWithEns.id, address.toLowerCase(), {
      ...filter,
      page_size: 1,
    }),
  ).then((page) => (page ? page.page.total_count : 0))

/**
 * Two counts: every label, and the labels not held by the caller
 * (`exclude_owner`, which keeps ownerless labels: nobody the caller can answer
 * for). A registry bigname has not indexed has no labels. A count bigname
 * declines to give (`total_count: null`, past its counting cap) is unknown
 * rather than a number, and the caller renders "we couldn't check".
 */
const getRegistryOccupants = ({
  address,
  account,
}: GetRegistryOccupantsParameters) =>
  fromPromise(
    Promise.all([
      countLabels(address, {}),
      countLabels(address, { exclude_owner: account.toLowerCase() }),
    ]),
    (e) => new GetRegistryOccupantsError({ cause: e as BignameError }),
  ).map(([count, thirdPartyCount]): RegistryOccupants | null =>
    count === null || thirdPartyCount === null
      ? null
      : { count, thirdPartyCount },
  )

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
