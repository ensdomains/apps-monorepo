import {
  type BignameError,
  type EventRow,
  MAX_PAGE_SIZE,
  type PermissionRow,
  type Power,
  readAllCollectionPages,
  readAllEnvelopes,
  toExactSeconds,
} from '@ens-apps/indexer/bigname'
import { logger } from '@ens-apps/utils/logger'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { err, ok } from 'neverthrow'
import { type Address, getAddress, isAddressEqual, zeroAddress } from 'viem'
import { envConfig } from '@/config'
import { bigname } from '@/lib/bigname'
import { previousPowers } from '@/lib/roles/permissionPowers'
import {
  decodeRegistryRoleBitmap,
  REGISTRY_ROLE_ORDER,
  type RegistryRole,
  registryPowersToRoles,
} from '@/lib/roles/registryPowerRoles'
import {
  getNodeRoleChangeLogs,
  toRoleHistoryEntries,
} from '@/lib/roles/roleChangeLogs'
import { ROOT_RESOURCE, type RoleHistoryEntry } from '@/lib/roles/roleHistory'
import { toResourceHex } from '@/lib/roles/toResourceHex'

class GetRootRoleReadsError extends TaggedError('GetRootRoleReadsError')<{
  cause: BignameError
}> {}

const toError = (cause: BignameError) => new GetRootRoleReadsError({ cause })

export type RootRoleHolder = {
  readonly account: Address
  readonly roles: readonly RegistryRole[]
}

export type RegistryRootRoles = {
  readonly holders: RootRoleHolder[]
  /**
   * Discovered registry code may derive additional authority (for example
   * from a parent registry). BigName conservatively marks that coverage gap;
   * ordinary indexed operator approvals are not the missing surface.
   */
  readonly areOperatorRolesUnlisted: boolean
}

/** Powers as registry roles, in bit order. */
const toRoles = (powers: readonly Power[]): RegistryRole[] => {
  const held = new Set(registryPowersToRoles(powers))
  return REGISTRY_ROLE_ORDER.filter((role) => held.has(role))
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
 * set the contract stores.
 */
const readRootPermissions = (
  registryAddress: Address,
  signal: AbortSignal | undefined,
) =>
  readAllEnvelopes(
    (cursor, pageSignal) =>
      bigname.permissions(
        {
          registry: `${envConfig.chain.id}:${registryAddress.toLowerCase()}`,
          page_size: MAX_PAGE_SIZE,
          ...(cursor && { cursor }),
        },
        { signal: pageSignal },
      ),
    { signal },
  ).map((pages) => ({
    rows: pages.flatMap((page) => page.data),
    meta: pages.at(-1)?.meta,
  }))

export const getBignameRootRoleHolders = (
  { registryAddress }: RegistryParameters,
  signal?: AbortSignal,
) =>
  readRootPermissions(registryAddress, signal)
    .mapErr(toError)
    .map(
      ({ rows, meta }): RegistryRootRoles => ({
        holders: toHolders(registryAddress)(rows),
        areOperatorRolesUnlisted:
          meta?.completeness === 'partial' &&
          !!meta.unlisted_permission_surfaces?.includes(
            'ens_v2_registry_operators',
          ),
      }),
    )

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
  const timestamp = toExactSeconds(row.timestamp)
  if (!row.transaction_hash || row.block_number === null || timestamp === null)
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
 * change needs neither a block lookup nor the earlier rows.
 */
const getBignameRootRoleChanges = (
  params: RegistryParameters & { readonly account: Address },
  signal?: AbortSignal,
) =>
  readAllCollectionPages<EventRow>(
    (cursor, pageSignal) =>
      bigname.events(
        {
          contract_address: params.registryAddress.toLowerCase() as Address,
          address: params.account.toLowerCase() as Address,
          kind: ['RootPermissionChanged'],
          include: ['data', 'raw'],
          order: 'desc',
          page_size: MAX_PAGE_SIZE,
          ...(cursor && { cursor }),
        },
        { signal: pageSignal },
      ),
    { signal },
  )
    .mapErr(toError)
    .map((rows) =>
      rows.filter(isRootRoleChangeOf(params)).flatMap(toRoleHistoryEntry),
    )

/**
 * One account's root role changes on one registry, newest first.
 *
 * Read from bigname first, with the node scan answering whenever it cannot:
 * an outage, a refusal (4xx), a server error (5xx), or a registry bigname has
 * not indexed. The node path is one `getLogs` on the root resource, the same
 * `EACRolesChanged` read the contract emits for every root grant and revoke.
 */
export const getRootRoleChanges = ResultFn(async function* (
  params: RegistryParameters & { readonly account: Address },
  signal?: AbortSignal,
) {
  const indexed = await getBignameRootRoleChanges(params, signal)
  if (indexed.isOk()) return ok(indexed.value)
  // A cancelled query is not an indexer failure: do not start a node read for
  // a surface nobody is waiting on.
  if (signal?.aborted) return err(indexed.error)

  logger.warn('Root role change read fell back to the node', {
    registryAddress: params.registryAddress,
    account: params.account,
    cause: indexed.error.cause,
  })

  const logs = yield* getNodeRoleChangeLogs({
    registryAddress: params.registryAddress,
    resource: ROOT_RESOURCE,
    account: params.account,
  })

  return toRoleHistoryEntries({
    logs,
    resource: ROOT_RESOURCE,
    // Root history speaks the full registry vocabulary, as `toRoles` does for
    // the indexed rows; ensjs's decoder would drop `can_name`.
    decodeRoles: decodeRegistryRoleBitmap,
  })
})
