import { logger } from '@ens-apps/utils/logger'
import { fromSync, ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import type {
  GetNameRolesAccountsReturnType,
  GetResourceErrorType,
} from '@ensdomains/ensjs/public/v2'
import { getResource as ensjs_getResource } from '@ensdomains/ensjs/public/v2'
import { type NormalizeErrorType, normalize } from '@ensdomains/ensjs/utils'
import {
  permissionedRegistryRoleCountSnippet,
  permissionedRegistryRolesSnippet,
} from '@ensdomains/ensjs-abi/v2/permissionedRegistry'
import { fromPromise, ok } from 'neverthrow'
import { type Address, zeroAddress } from 'viem'
import { getBlockNumber, readContract } from 'viem/actions'
import { getAction } from 'viem/utils'
import { decodeRoleBitmap } from '@/lib/roles/decodeRoleBitmap'
import {
  getIndexedRoleChangeLogs,
  getNodeRoleChangeLogs,
} from '@/lib/roles/roleChangeLogs'
import { toResourceHex } from '@/lib/roles/toResourceHex'
import { safeGetClient } from '@/lib/wagmi/helpers'

class NameNotNormalizableError extends TaggedError('NameNotNormalizableError')<{
  cause: NormalizeErrorType
}> {}

class GetResourceError extends TaggedError('GetResourceError')<{
  cause: GetResourceErrorType
}> {}

class GetBlockNumberError extends TaggedError('GetBlockNumberError')<{
  cause: unknown
}> {}

class ReadRegistryRolesError extends TaggedError('ReadRegistryRolesError')<{
  cause: unknown
}> {}

type NameRolesAccountsParameters = {
  /** The full name. The label is derived from it, so the two always agree. */
  readonly name: string
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
  const entries = [...bitmaps]

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
  registryAddress,
}: NameRolesAccountsParameters) {
  // Normalized before hashing: a raw route parameter would address a resource
  // the registry never wrote to.
  const normalized = yield* fromSync(
    () => normalize(name),
    (e) => new NameNotNormalizableError({ cause: e as NormalizeErrorType }),
  )
  const [label] = normalized.split('.')

  const client = yield* safeGetClient()

  const blockNumberRead = fromPromise(
    getAction(client, getBlockNumber, 'getBlockNumber')({}),
    (cause) => new GetBlockNumberError({ cause }),
  )
  const resource = yield* fromPromise(
    ensjs_getResource(client, { label, registryAddress }),
    (e) => new GetResourceError({ cause: e as GetResourceErrorType }),
  )
  const blockNumber = yield* blockNumberRead

  const check = (bitmaps: ReadonlyMap<Address, bigint>) =>
    matchesRegistry({ registryAddress, resource, blockNumber, bitmaps })

  const indexed = await getIndexedRoleChangeLogs({ registryAddress, resource })
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
    toBlock: blockNumber,
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

const getNameRolesAccountsQueryKey = createQueryKey<
  'get-name-roles-accounts',
  NameRolesAccountsParameters
>('get-name-roles-accounts')

/**
 * Normalized for the cache key so two spellings of one name share an entry.
 * Deliberately falls back to the raw name rather than throwing: this runs while
 * building query options during render, and a malformed name should surface as
 * the query's tagged error, which it does when the fetcher normalizes it again.
 */
const cacheableName = (name: string): string => {
  try {
    return normalize(name)
  } catch {
    return name
  }
}

export const getNameRolesAccountsQueryOptions = ({
  name,
  ...params
}: NameRolesAccountsParameters) =>
  resultQueryOptions({
    queryKey: getNameRolesAccountsQueryKey({
      name: cacheableName(name),
      ...params,
    }),
    queryFn: ({ queryKey: [, params] }) => getNameRolesAccounts(params),
  })
