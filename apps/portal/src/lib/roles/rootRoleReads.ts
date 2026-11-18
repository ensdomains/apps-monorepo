import {
  type HistoryEvent,
  type IndexerReadError,
  type RootRoleGrant,
  readAllItems,
} from '@ens-apps/indexer/reads'
import { logger } from '@ens-apps/utils/logger'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { err, ok } from 'neverthrow'
import { type Address, getAddress, isAddressEqual, zeroAddress } from 'viem'
import { indexer } from '@/lib/indexer'
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
  cause: IndexerReadError
}> {}

const toError = (cause: IndexerReadError) =>
  new GetRootRoleReadsError({ cause })

const PAGE_SIZE = 200

export type RootRoleHolder = {
  readonly account: Address
  readonly roles: readonly RegistryRole[]
}

export type RegistryRootRoles = {
  readonly holders: RootRoleHolder[]
  /**
   * Discovered registry code may derive additional authority (for example
   * from a parent registry). The indexer conservatively marks that coverage gap;
   * ordinary indexed operator approvals are not the missing surface.
   */
  readonly areOperatorRolesUnlisted: boolean
}

/** Powers as registry roles, in bit order. */
const toRoles = (powers: readonly string[]): RegistryRole[] => {
  const held = new Set(registryPowersToRoles(powers))
  return REGISTRY_ROLE_ORDER.filter((role) => held.has(role))
}

type RegistryParameters = {
  readonly registryAddress: Address
}

/**
 * One holder per account with the roles it holds now. An account left with no
 * role the tables can show is dropped, as the log scan drops a revoked one.
 */
const toHolders = (grants: readonly RootRoleGrant[]): RootRoleHolder[] => {
  const powersByAccount = new Map<Address, readonly string[]>()
  for (const grant of grants) {
    const account = getAddress(grant.account)
    if (account === zeroAddress) continue
    powersByAccount.set(account, [
      ...(powersByAccount.get(account) ?? []),
      ...grant.powers,
    ])
  }
  return [...powersByAccount]
    .map(([account, powers]) => ({ account, roles: toRoles(powers) }))
    .filter(({ roles }) => roles.length > 0)
}

/**
 * The current holders of a registry's root resource, from the indexer. Root
 * rows state the declared role bits with no read-time mask, so they are the
 * same set the contract stores. Each page is read whole, so the last one's
 * coverage survives.
 */
const readRootPermissions = (
  registryAddress: Address,
  signal: AbortSignal | undefined,
) =>
  readAllItems(
    (cursor, pageSignal) =>
      indexer
        .getPermissions(
          {
            registry: registryAddress,
            pageSize: PAGE_SIZE,
            ...(cursor && { cursor }),
          },
          { signal: pageSignal },
        )
        .map((page) => ({ ...page, items: [page] })),
    { signal },
  ).map((pages) => ({
    grants: pages.flatMap((page) => page.items),
    lastPage: pages.at(-1),
  }))

export const getIndexedRootRoleHolders = (
  { registryAddress }: RegistryParameters,
  signal?: AbortSignal,
) =>
  readRootPermissions(registryAddress, signal)
    .mapErr(toError)
    .map(
      ({ grants, lastPage }): RegistryRootRoles => ({
        holders: toHolders(grants),
        areOperatorRolesUnlisted:
          lastPage?.completeness === 'partial' && lastPage.hasUnlistedOperators,
      }),
    )

type RootRoleChangeRow = Extract<HistoryEvent, { type: 'permission' }> & {
  data: Extract<HistoryEvent, { type: 'permission' }>['data'] & {
    address: string
  }
}

const isRootRoleChangeOf =
  ({ registryAddress, account }: RegistryParameters & { account: Address }) =>
  (row: HistoryEvent): row is RootRoleChangeRow =>
    row.type === 'permission' &&
    row.data.grant_scope?.kind === 'root' &&
    !!row.data.address &&
    isAddressEqual(getAddress(row.data.address), account) &&
    !!row.contractAddress &&
    isAddressEqual(row.contractAddress, registryAddress)

const ROOT_RESOURCE_HEX = toResourceHex(ROOT_RESOURCE)

/** A row with no transaction or position is not listed. */
const toRoleHistoryEntry = (row: RootRoleChangeRow): RoleHistoryEntry[] => {
  if (!row.transactionHash || row.blockNumber === null || !row.timestamp)
    return []
  return [
    {
      account: getAddress(row.data.address),
      resource: ROOT_RESOURCE_HEX,
      oldRoles: toRoles(previousPowers(row.data, undefined)),
      newRoles: toRoles(row.data.powers ?? []),
      transactionHash: row.transactionHash,
      timestamp: BigInt(Math.floor(row.timestamp.getTime() / 1000)),
      blockNumber: BigInt(row.blockNumber),
    },
  ]
}

/**
 * One account's root role changes on one registry, newest first, from the
 * indexer.
 *
 * `contract_address` + `address` + `kind=RootPermissionChanged` is the filter
 * bigname documents for exactly this read, so the server pages only the rows
 * shown; `type=permission` would also page every name token's role change on
 * the registry. Each row carries its timestamp and, because the log states
 * the old bitmap, `added_powers` and `removed_powers`, so the set before a
 * change needs neither a block lookup nor the earlier rows.
 */
const getIndexedRootRoleChanges = (
  params: RegistryParameters & { readonly account: Address },
  signal?: AbortSignal,
) =>
  readAllItems(
    (cursor, pageSignal) =>
      indexer.getEvents(
        {
          contractAddress: params.registryAddress.toLowerCase() as Address,
          address: params.account.toLowerCase() as Address,
          kinds: ['RootPermissionChanged'],
          order: 'desc',
          pageSize: PAGE_SIZE,
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
 * Read from the indexer first, with the node scan answering whenever it
 * cannot: an outage, a refusal, a server error, or a registry it has not
 * indexed. The node path is one `getLogs` on the root resource, the same
 * `EACRolesChanged` read the contract emits for every root grant and revoke.
 */
export const getRootRoleChanges = ResultFn(async function* (
  params: RegistryParameters & { readonly account: Address },
  signal?: AbortSignal,
) {
  const indexed = await getIndexedRootRoleChanges(params, signal)
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
