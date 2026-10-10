import { logger } from '@ens-apps/utils/logger'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import type { GetNameRolesAccountsReturnType } from '@ensdomains/ensjs/public/v2'
import {
  permissionedRegistryRoleCountSnippet,
  permissionedRegistryRolesSnippet,
} from '@ensdomains/ensjs-abi/v2/permissionedRegistry'
import { err, fromPromise, ok } from 'neverthrow'
import { type Address, zeroAddress } from 'viem'
import { getBlockNumber, readContract } from 'viem/actions'
import { getAction } from 'viem/utils'
import type { ResourceId } from '@/lib/resource/resourceId'
import { decodeRoleBitmap } from '@/lib/roles/decodeRoleBitmap'
import {
  getIndexedRoleChangeLogs,
  getNodeRoleChangeLogs,
} from '@/lib/roles/roleChangeLogs'
import { toResourceHex } from '@/lib/roles/toResourceHex'
import { safeGetClient } from '@/lib/wagmi/helpers'

class GetBlockNumberError extends TaggedError('GetBlockNumberError')<{
  cause: unknown
}> {}

class ReadRegistryRolesError extends TaggedError('ReadRegistryRolesError')<{
  cause: unknown
}> {}

type NameRolesAccountsParameters = {
  /** The full name, whose current registration bigname reads the history of. */
  readonly name: string
  /**
   * The name's EAC resource, resolved by the caller. Not derived from the name
   * here: a label rendered `[<64 hex>]` does not say which name it is, and the
   * rows this produces are the ones the sidebar's grants and revokes act on, so
   * they must be about the same resource those writes address (WEB-1458).
   */
  readonly resource: ResourceId | null
  readonly registryAddress: Address
}

type NameRoleHolders = {
  readonly holders: GetNameRolesAccountsReturnType
  /** False when `holders` may be missing someone. */
  readonly isVerified: boolean
}

type RoleChange = {
  readonly args: {
    readonly account: Address
    readonly newRoleBitmap: bigint
  }
}

const foldRoleBitmaps = (
  logs: readonly RoleChange[],
): ReadonlyMap<Address, bigint> => {
  const latest = new Map<Address, bigint>()

  for (const log of logs) {
    const account = log.args.account
    if (account === zeroAddress) continue
    latest.set(account, log.args.newRoleBitmap)
  }

  return latest
}

const toHolders = (
  bitmaps: ReadonlyMap<Address, bigint>,
): GetNameRolesAccountsReturnType =>
  new Map(
    [...bitmaps]
      .map(([account, bitmap]) => [account, decodeRoleBitmap(bitmap)] as const)
      .filter(([, roles]) => roles.length > 0),
  )

/**
 * `roleCount` packs a per-role assignee counter into each role's nybble, so it
 * equals the sum of every holder's bitmap. A replay that sums to it, with each
 * account's roles held on chain, is complete. Subset rather than equality
 * because `roles` adds an approved operator's owner roles.
 */
const matchesRegistry = ResultFn(async function* ({
  registryAddress,
  resource,
  blockNumber,
  bitmaps,
}: {
  readonly registryAddress: Address
  readonly resource: bigint
  readonly blockNumber: bigint
  readonly bitmaps: ReadonlyMap<Address, bigint>
}) {
  const client = yield* safeGetClient()
  const call = getAction(client, readContract, 'readContract')
  // A revoked account holds nothing, so it passes the subset check unread and
  // adds nothing to the sum; reading it would only grow the batch.
  const entries = [...bitmaps].filter(([, bitmap]) => bitmap !== 0n)

  const [roleCount, held] = yield* fromPromise(
    Promise.all([
      call({
        address: registryAddress,
        abi: permissionedRegistryRoleCountSnippet,
        functionName: 'roleCount',
        args: [resource],
        blockNumber,
      }),
      Promise.all(
        entries.map(([account]) =>
          call({
            address: registryAddress,
            abi: permissionedRegistryRolesSnippet,
            functionName: 'roles',
            args: [resource, account],
            blockNumber,
          }),
        ),
      ),
    ]),
    (cause) => new ReadRegistryRolesError({ cause }),
  )

  const replayed = entries.reduce((sum, [, bitmap]) => sum + bitmap, 0n)

  return ok(
    replayed === roleCount &&
      entries.every(([, bitmap], i) => ((held[i] ?? 0n) & bitmap) === bitmap),
  )
})

/**
 * Current `account -> roles[]` state for a name, replayed from its role
 * change logs.
 *
 * The resource comes from the registry, so it carries the name's current
 * `eacVersionId` and both sources return only this registration's grants: a
 * previous owner's sit under the pre-bump resource.
 *
 * The indexed replay is only trusted when it matches the registry; otherwise
 * the node is read up to the same block, and a node replay that still
 * disagrees is unverified.
 */
export const getNameRolesAccounts = ResultFn(async function* ({
  name,
  resource,
  registryAddress,
}: NameRolesAccountsParameters) {
  // No resource, no rows to attest to. Callers gate the query on this, so it is
  // defence rather than a path anything relies on.
  if (resource === null)
    return ok<NameRoleHolders>({ holders: new Map(), isVerified: false })

  const client = yield* safeGetClient()

  // Only pins the reads that verify a replay: without it the holders are still
  // listed, just unverified.
  const blockNumber = await fromPromise(
    getAction(client, getBlockNumber, 'getBlockNumber')({}),
    (cause) => new GetBlockNumberError({ cause }),
  )

  const check = async (bitmaps: ReadonlyMap<Address, bigint>) =>
    blockNumber.isErr()
      ? err(blockNumber.error)
      : await matchesRegistry({
          registryAddress,
          resource,
          blockNumber: blockNumber.value,
          bitmaps,
        })

  const indexed = await getIndexedRoleChangeLogs({
    name,
    registryAddress,
    resource,
  })
  const fromIndexer = indexed.isOk() ? foldRoleBitmaps(indexed.value) : null

  if (fromIndexer) {
    const matches = await check(fromIndexer)
    if (matches.isErr()) {
      logger.warn('Role holders could not be checked against the registry', {
        registryAddress,
        resource: toResourceHex(resource),
        cause: matches.error.cause,
      })
    }
    // Without the registry's state the node replay can't be verified either.
    if (matches.isErr() || matches.value) {
      return ok<NameRoleHolders>({
        holders: toHolders(fromIndexer),
        isVerified: matches.unwrapOr(false),
      })
    }
  }

  logger.warn('Role holders fell back to the node', {
    registryAddress,
    resource: toResourceHex(resource),
    reason: indexed.isErr() ? indexed.error.reason : 'registry-mismatch',
    cause: indexed.isErr() ? indexed.error.cause : undefined,
  })

  const node = await getNodeRoleChangeLogs({
    registryAddress,
    resource,
    toBlock: blockNumber.unwrapOr(undefined),
  })
  if (node.isErr() && fromIndexer) {
    return ok<NameRoleHolders>({
      holders: toHolders(fromIndexer),
      isVerified: false,
    })
  }

  const bitmaps = foldRoleBitmaps(yield* node)
  const matches = await check(bitmaps)

  return ok<NameRoleHolders>({
    holders: toHolders(bitmaps),
    isVerified: matches.unwrapOr(false),
  })
})

export const getNameRolesAccountsQueryKey = createQueryKey<
  'get-name-roles-accounts',
  Record<string, unknown>
>('get-name-roles-accounts')

export const getNameRolesAccountsQueryOptions = (
  params: NameRolesAccountsParameters,
) =>
  resultQueryOptions({
    // The resource is a bigint, which the default key hash cannot serialise.
    queryKey: getNameRolesAccountsQueryKey({
      ...params,
      resource: params.resource?.toString() ?? null,
    }),
    queryFn: () => getNameRolesAccounts(params),
  })
