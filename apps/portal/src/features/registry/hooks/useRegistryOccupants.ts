import {
  type BignameError,
  fetchAllPages,
  isBignameError,
  MAX_PAGE_SIZE,
} from '@ens-apps/bigname'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { fromPromise } from 'neverthrow'
import { type Address, isAddressEqual } from 'viem'
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
 * Both numbers come from reading every label rather than a sample —
 * `thirdPartyCount` gates a destructive write, so a paged sample that missed
 * the one stranger in a large registry would answer it wrongly.
 */
export type RegistryOccupants = {
  readonly count: number
  readonly thirdPartyCount: number
}

/**
 * Labels read before the count is given up on. bigname's labels route has no
 * owner filter, so the third parties are counted here, page by page.
 */
const OCCUPANTS_MAX_ROWS = 2000

/**
 * Every label in the registry, each owner compared with the caller. The count
 * gates a destructive write, so anything short of the whole registry — a
 * registry bigname has not indexed, or one too large to read here — is
 * unknown rather than a number, and the caller renders "we couldn't check".
 */
const getRegistryOccupants = ({
  address,
  account,
}: GetRegistryOccupantsParameters) =>
  fromPromise(
    fetchAllPages(
      (cursor) =>
        bigname.listRegistryLabels(sepoliaWithEns.id, address.toLowerCase(), {
          page_size: MAX_PAGE_SIZE,
          cursor,
        }),
      { maxRows: OCCUPANTS_MAX_ROWS },
    ).catch((e: unknown) => {
      if (isBignameError(e, 'not_found')) return null
      throw e
    }),
    (e) => new GetRegistryOccupantsError({ cause: e as BignameError }),
  ).map((labels): RegistryOccupants | null => {
    if (!labels || labels.truncated) return null
    // A label with no owner is nobody's the caller can answer for, so it counts
    // against them, as it did when this was total minus own.
    const thirdPartyCount = labels.rows.filter(
      ({ owner }) => !owner || !isAddressEqual(owner, account),
    ).length
    return { count: labels.rows.length, thirdPartyCount }
  })

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
