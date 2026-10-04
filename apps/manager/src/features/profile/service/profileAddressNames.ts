import { timestampToSeconds } from '@ens-apps/bigname'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { skipToken } from '@tanstack/react-query'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import {
  addressNameExpirySeconds,
  type DashboardNameRole,
  getAddressNameRoles,
  isListedAddressName,
  protocolForAuthority,
} from '@/features/dashboard/dashboardNames'
import { getAllAddressNames } from '@/features/dashboard/service/queries/getDashboardNames'

export { PROFILE_NAMES_PAGE_SIZE } from './profileOwnedNames'

type ProfileAddressNameProtocol = 'v1' | 'v2'
type ProfileAddressNameRoleCategory = 'owned' | 'managed'

export type ProfileAddressName = {
  readonly key: string
  readonly label: string
  readonly protocol: ProfileAddressNameProtocol
  /** Seconds since the epoch; `0` = does not expire, `null` = unknown. */
  readonly expiryDate: number | null
  readonly createdAt: number | null
  readonly registeredAt: number | null
  readonly nameRoles: readonly DashboardNameRole[]
  readonly roleCategory: ProfileAddressNameRoleCategory
}

const timestampOrNull = (value: string | undefined): number | null =>
  timestampToSeconds(value) ?? null

class GetProfileAddressNamesError extends TaggedError(
  'GetProfileAddressNamesError',
)<{
  cause: unknown
}> {}

/**
 * Every name the address holds any authority relation on, ENSv1 and ENSv2 in
 * one bigname collection, newest registration first. `relations` and the
 * ENSv2 `role_summary` decide the Owner/Manager chips and the owned/managed
 * split.
 */
export const getProfileAddressNames = ResultFn(async function* (
  address: Address,
) {
  const normalizedAddress = address.toLowerCase()

  const rows = yield* fromPromise(
    getAllAddressNames(normalizedAddress, {
      sort: 'registered_at',
      order: 'desc',
    }),
    (error) => new GetProfileAddressNamesError({ cause: error }),
  )

  const names = rows.filter(isListedAddressName).flatMap((row) => {
    const nameRoles = getAddressNameRoles(row, [normalizedAddress])
    if (nameRoles.length === 0) return []
    return [
      {
        key: row.namehash,
        label: row.name,
        protocol: protocolForAuthority(row.authority),
        expiryDate: addressNameExpirySeconds(row),
        createdAt: timestampOrNull(row.created_at),
        registeredAt: timestampOrNull(row.registered_at),
        nameRoles,
        roleCategory: nameRoles.includes('owner') ? 'owned' : 'managed',
      } satisfies ProfileAddressName,
    ]
  })

  return ok<ProfileAddressName[]>(names)
})

export const profileAddressNamesQuery = (address?: Address) =>
  resultQueryOptions({
    queryKey: qk('profile', 'address_names', {
      address: address?.toLowerCase(),
    }),
    queryFn: address ? () => getProfileAddressNames(address) : skipToken,
    meta: {
      dependsOn: ['indexer'],
    },
  })
