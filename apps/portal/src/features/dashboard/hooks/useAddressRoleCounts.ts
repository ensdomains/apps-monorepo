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
const getAddressRoleCounts = (
  { address }: GetAddressRoleCountsParameters,
  signal: AbortSignal,
) =>
  readAllNames(
    readNames,
    { address, protocol: 'v2', includeRoles: true },
    { pageSize: ROLE_PAGE_SIZE, signal },
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
    queryFn: ({ queryKey: [, params], signal }) =>
      getAddressRoleCounts(params, signal),
  })

/** An ENSv2 row's role count, or why there is none to show yet. */
export type RoleCount = number | 'loading' | 'unavailable'

/** The counts a names list can attach, from the role counts query. */
export const roleCountsOf = (query: {
  readonly data?: ReadonlyMap<string, number>
  readonly isError: boolean
}): ReadonlyMap<string, number> | 'loading' | 'unavailable' =>
  query.data ?? (query.isError ? 'unavailable' : 'loading')

/** A row the address holds only as a former owner, in grace: it holds no roles. */
const isFormerOwnerOnly = (relations: readonly string[] | undefined) =>
  !!relations?.length &&
  relations.every((relation) => relation === 'former_owner')

/** A names list with each ENSv2 row's role count, or its state until one arrives. */
export const withRoleCounts = <
  Row extends {
    readonly name: string | null
    readonly protocolVersion: string
    readonly relations?: readonly string[]
  },
>(
  rows: readonly Row[],
  roleCounts: ReturnType<typeof roleCountsOf>,
): readonly (Row & { readonly roleCount?: RoleCount })[] =>
  rows.map((row) => {
    if (
      row.name === null ||
      row.protocolVersion !== 'ENSv2' ||
      isFormerOwnerOnly(row.relations)
    )
      return row
    const roleCount =
      typeof roleCounts === 'string' ? roleCounts : roleCounts.get(row.name)
    return roleCount === undefined ? row : { ...row, roleCount }
  })
