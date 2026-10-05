import {
  type BignameError,
  type EventRow,
  fetchAllPages,
  isUnknownQueryParamError,
  MAX_PAGE_SIZE,
  type PermissionRow,
  type Power,
  timestampToBigInt,
} from '@ens-apps/bigname'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { type Role, registryRoles } from '@ensdomains/ensjs/utils/v2'
import { fromPromise } from 'neverthrow'
import { type Address, getAddress, isAddressEqual, zeroAddress } from 'viem'
import { bigname } from '@/lib/bigname'
import { previousPowers } from '@/lib/roles/nameRoleChanges'
import { registryPowersToRoles } from '@/lib/roles/registryPowerRoles'
import {
  ROOT_RESOURCE,
  type RoleHistoryEntry,
} from '@/lib/roles/roleChangeLogs'
import { toResourceHex } from '@/lib/roles/toResourceHex'
import { sepoliaWithEns } from '@/lib/wagmi'
import { queryClient } from '@/utils/queryClient'

class GetRootRoleReadsError extends TaggedError('GetRootRoleReadsError')<{
  cause: BignameError
}> {}

const toError = (e: unknown) =>
  new GetRootRoleReadsError({ cause: e as BignameError })

export const rootRoleReadsSupportedQueryKey = createQueryKey(
  'bigname-root-role-reads-supported',
)

/** How long a "not supported" answer stands before the deployment is asked again. */
const UNSUPPORTED_RECHECK_MS = 5 * 60 * 1000

/**
 * Whether this bigname deployment serves registry root roles: the holders on
 * `GET /v1/permissions?registry=` and the `RootPermissionChanged` history
 * rows, which ship in one release. v0.4.1 has neither. It rejects `registry`
 * as an unknown parameter, which is the only signal there is: its history
 * simply lacks the rows, and rejects `kind=RootPermissionChanged` with a 400
 * that does not name a version.
 *
 * Any registry answers the question, so the probe asks for one row of the
 * `.eth` registry. Any other failure rejects and is not cached.
 */
const probeRootRoleReads = (): Promise<boolean> =>
  bigname
    .listPermissions({
      registry: {
        chain_id: sepoliaWithEns.id,
        address: getChainContractAddress({
          chain: sepoliaWithEns,
          contract: 'ensRegistry',
        }),
      },
      page_size: 1,
    })
    .then(
      () => true,
      (error: unknown) => {
        if (isUnknownQueryParamError(error, 'registry')) return false
        throw error
      },
    )

/**
 * The cached answer to `probeRootRoleReads`: one request per session once the
 * deployment supports the reads, and one every five minutes while it does not,
 * so an open tab picks the release up without a reload.
 */
export const getRootRoleReadsSupported = () =>
  fromPromise(
    queryClient.fetchQuery({
      queryKey: rootRoleReadsSupportedQueryKey(),
      queryFn: probeRootRoleReads,
      staleTime: ({ state }) =>
        state.data ? Number.POSITIVE_INFINITY : UNSUPPORTED_RECHECK_MS,
    }),
    toError,
  )

export type RootRoleHolder = {
  readonly account: Address
  readonly roles: readonly Role[]
}

export type RegistryRootRoles = {
  readonly holders: RootRoleHolder[]
  /**
   * The registry can also give its root roles to operators, and bigname does
   * not list those. Set for every registry outside the ENS manifest (user
   * registries, migration registries), with or without listed holders.
   */
  readonly areOperatorRolesUnlisted: boolean
}

const ROLE_ORDER = Object.keys(registryRoles) as Role[]

/**
 * Powers as ensjs roles in `registryRoles` order, which is what `decodeRoleBitmap`
 * gives the log scan. `can_name` and `admin_can_name` have no ensjs role and
 * are dropped, as the scan drops their bits.
 */
const toRoles = (powers: readonly Power[]): Role[] => {
  const held = new Set(registryPowersToRoles(powers))
  return ROLE_ORDER.filter((role) => held.has(role))
}

type RegistryParameters = {
  readonly registryAddress: Address
}

const isRootRowOf =
  (registryAddress: Address) =>
  ({ grant_scope: scope }: PermissionRow): boolean =>
    scope.kind === 'root' &&
    (!scope.detail.registry ||
      isAddressEqual(scope.detail.registry.address, registryAddress))

/**
 * One holder per account with the roles it holds now. An account left with no
 * role the tables can show is dropped, as the log scan drops a revoked one.
 */
const toHolders =
  (registryAddress: Address) =>
  (rows: readonly PermissionRow[]): RootRoleHolder[] => {
    const powersByAccount = new Map<Address, readonly Power[]>()
    for (const row of rows.filter(isRootRowOf(registryAddress))) {
      const account = getAddress(row.address)
      if (account === zeroAddress) continue
      powersByAccount.set(account, [
        ...(powersByAccount.get(account) ?? []),
        ...row.powers,
      ])
    }
    return [...powersByAccount]
      .map(([account, powers]) => ({ account, roles: toRoles(powers) }))
      .filter(({ roles }) => roles.length > 0)
  }

/**
 * The current holders of a registry's root resource, from bigname. Root rows
 * state the declared role bits with no read-time mask, so they are the same
 * set the log scan folds to. Call only when `getRootRoleReadsSupported`.
 */
export const getBignameRootRoleHolders = ({
  registryAddress,
}: RegistryParameters) =>
  fromPromise(
    fetchAllPages((cursor) =>
      bigname.listPermissions({
        registry: {
          chain_id: sepoliaWithEns.id,
          address: registryAddress.toLowerCase() as Address,
        },
        page_size: MAX_PAGE_SIZE,
        cursor,
      }),
    ),
    toError,
  ).map(
    ({ rows, meta }): RegistryRootRoles => ({
      holders: toHolders(registryAddress)(rows),
      areOperatorRolesUnlisted:
        meta.completeness === 'partial' &&
        !!meta.unlisted_permission_surfaces?.includes(
          'ens_v2_registry_operators',
        ),
    }),
  )

/** Bound on one account's root role changes on one registry. */
const ROOT_ROLE_CHANGES_MAX_ROWS = 2000

type RootRoleChangeRow = Extract<EventRow, { type: 'permission' }> & {
  data: NonNullable<Extract<EventRow, { type: 'permission' }>['data']> & {
    address: string
  }
}

const isRootRoleChangeOf =
  ({ registryAddress, account }: RegistryParameters & { account: Address }) =>
  (row: EventRow): row is RootRoleChangeRow =>
    row.type === 'permission' &&
    row.data?.grant_scope?.kind === 'root' &&
    !!row.data.address &&
    isAddressEqual(getAddress(row.data.address), account) &&
    !!row.contract_address &&
    isAddressEqual(row.contract_address, registryAddress)

const ROOT_RESOURCE_HEX = toResourceHex(ROOT_RESOURCE)

/** A row with no transaction or position is not listed. */
const toRoleHistoryEntry = (row: RootRoleChangeRow): RoleHistoryEntry[] => {
  const timestamp = timestampToBigInt(row.timestamp)
  if (
    !row.transaction_hash ||
    row.block_number === null ||
    timestamp === undefined
  )
    return []
  return [
    {
      account: getAddress(row.data.address),
      resource: ROOT_RESOURCE_HEX,
      oldRoles: toRoles(previousPowers(row.data, undefined)),
      newRoles: toRoles(row.data.powers ?? []),
      transactionHash: row.transaction_hash,
      timestamp,
      blockNumber: BigInt(row.block_number),
    },
  ]
}

/**
 * One account's root role changes on one registry, newest first, from bigname.
 *
 * `contract_address` + `address` + `kind=RootPermissionChanged` is the filter
 * bigname documents for exactly this read, so the server pages only the rows
 * shown; `type=permission` would also page every name token's role change on
 * the registry. Each row carries its timestamp and, because the log states
 * the old bitmap, `added_powers` and `removed_powers`, so the set before a
 * change needs neither a block lookup nor the earlier rows. Call only when
 * `getRootRoleReadsSupported`: v0.4.1 rejects the `kind`.
 */
export const getBignameRootRoleChanges = (
  params: RegistryParameters & { readonly account: Address },
) =>
  fromPromise(
    fetchAllPages(
      (cursor) =>
        bigname.listEvents({
          contract_address: params.registryAddress.toLowerCase(),
          address: params.account.toLowerCase(),
          kind: 'RootPermissionChanged',
          include: ['data', 'raw'],
          order: 'desc',
          page_size: MAX_PAGE_SIZE,
          cursor,
        }),
      { maxRows: ROOT_ROLE_CHANGES_MAX_ROWS },
    ),
    toError,
  ).map(({ rows }) =>
    rows.filter(isRootRoleChangeOf(params)).flatMap(toRoleHistoryEntry),
  )
