import { readNamesForAddress } from '@ens-apps/indexer/bigname'
import { type IndexerReadError, readAllNames } from '@ens-apps/indexer/reads'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import type { Address } from 'viem'
import { bigname } from '@/lib/bigname'
import { registryPowersToRoles } from '@/lib/roles/registryPowerRoles'

class GetAddressRoleCountsError extends TaggedError(
  'GetAddressRoleCountsError',
)<{
  cause: IndexerReadError
}> {}

type GetAddressRoleCountsParameters = { readonly address: Address }

// Role summaries cost bigname far more than the names alone; small pages keep
// each request inside the client's timeout for wallets with many names.
const ROLE_PAGE_SIZE = 50

const readNames = readNamesForAddress(bigname)

/**
 * The ENSv2 roles the address holds on each of its names, by name. Read apart
 * from the names list, so a slow or failed read only leaves out the counts.
 */
const getAddressRoleCounts = ({ address }: GetAddressRoleCountsParameters) =>
  readAllNames(
    readNames,
    { address, protocol: 'v2', includeRoles: true },
    ROLE_PAGE_SIZE,
  )
    .map(
      (names): ReadonlyMap<string, number> =>
        new Map(
          names.map((name) => [
            name.name,
            new Set(registryPowersToRoles(name.heldPowers ?? [])).size,
          ]),
        ),
    )
    .mapErr((cause) => new GetAddressRoleCountsError({ cause }))

export const getAddressRoleCountsQueryKey = createQueryKey<
  'get-address-role-counts',
  GetAddressRoleCountsParameters
>('get-address-role-counts')

export const getAddressRoleCountsQueryOptions = (
  params: GetAddressRoleCountsParameters,
) =>
  resultQueryOptions({
    queryKey: getAddressRoleCountsQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getAddressRoleCounts(params),
    retry: false,
  })

/** A names list with each ENSv2 row's role count, once the counts arrive. */
export const withRoleCounts = <
  Row extends {
    readonly name: string | null
    readonly protocolVersion: string
  },
>(
  rows: readonly Row[],
  roleCounts: ReadonlyMap<string, number> | undefined,
): readonly (Row & { readonly roleCount?: number })[] =>
  roleCounts
    ? rows.map((row) => {
        const roleCount =
          row.name !== null && row.protocolVersion === 'ENSv2'
            ? roleCounts.get(row.name)
            : undefined
        return roleCount === undefined ? row : { ...row, roleCount }
      })
    : rows
