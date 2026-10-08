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
import { getRoleHolders } from '@/lib/roles/roleHolders'
import { toResourceHex } from '@/lib/roles/toResourceHex'
import { safeGetClient } from '@/lib/wagmi/helpers'

class GetBlockNumberError extends TaggedError('GetBlockNumberError')<{
  cause: unknown
}> {}

class ReadRegistryRolesError extends TaggedError('ReadRegistryRolesError')<{
  cause: unknown
}> {}

type NameRolesAccountsParameters = {
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
 * equals the sum of every holder's bitmap. A list that sums to it, with each
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
 * Current `account -> roles[]` state for a name, read from the indexer's role
 * assignments and checked against the registry.
 *
 * The resource comes from the registry, so it carries the name's current
 * `eacVersionId` and only this registration's grants are returned: a previous
 * owner's sit under the pre-bump resource. An account whose bitmap decodes to
 * nothing has been revoked and is dropped.
 *
 * The node cannot list holders, so a list that disagrees with the registry, or
 * could not be checked against it, is returned unverified rather than re-read.
 */
export const getNameRolesAccounts = ResultFn(async function* ({
  resource,
  registryAddress,
}: NameRolesAccountsParameters) {
  // No resource, no rows to attest to. Callers gate the query on this, so it is
  // defence rather than a path anything relies on.
  if (resource === null)
    return ok<NameRoleHolders>({ holders: new Map(), isVerified: false })

  const client = yield* safeGetClient()

  // Only pins the reads that verify the list: without it the holders are still
  // listed, just unverified.
  const blockNumber = await fromPromise(
    getAction(client, getBlockNumber, 'getBlockNumber')({}),
    (cause) => new GetBlockNumberError({ cause }),
  )

  const assignments = yield* getRoleHolders({ registryAddress, resource })
  const bitmaps: ReadonlyMap<Address, bigint> = new Map(
    assignments
      .filter(({ account }) => account !== zeroAddress)
      .map(({ account, roleBitmap }) => [account, roleBitmap]),
  )

  const matches = blockNumber.isErr()
    ? err(blockNumber.error)
    : await matchesRegistry({
        registryAddress,
        resource,
        blockNumber: blockNumber.value,
        bitmaps,
      })

  if (matches.isErr() || !matches.value) {
    logger.warn('Role holders are not verified against the registry', {
      registryAddress,
      resource: toResourceHex(resource),
      reason: matches.isErr() ? 'unchecked' : 'registry-mismatch',
      cause: matches.isErr() ? matches.error.cause : undefined,
    })
  }

  return ok<NameRoleHolders>({
    holders: toHolders(bitmaps),
    isVerified: matches.unwrapOr(false),
  })
})

const getNameRolesAccountsQueryKey = createQueryKey<
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
