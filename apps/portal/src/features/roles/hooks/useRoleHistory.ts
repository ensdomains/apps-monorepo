/**
 * Role-change history for one name.
 *
 * The resource is read from the registry rather than derived from the label, so
 * it carries the name's current `eacVersionId`. Pinning that as the log topic
 * scopes the read to this registration: a previous owner's grants live under
 * the pre-bump resource and are excluded by the node, not by a later filter.
 */

import { fromSync, ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import type { GetResourceErrorType } from '@ensdomains/ensjs/public/v2'
import { getResource as ensjs_getResource } from '@ensdomains/ensjs/public/v2'
import {
  makeLabelNodeAndParent,
  type NormalizeErrorType,
  normalize,
} from '@ensdomains/ensjs/utils'
import { fromPromise, ok } from 'neverthrow'
import type { Address, Hex } from 'viem'
import { getBlockTimestamps } from '@/features/profile/hooks/useBlockTimestamps'
import { decodeRoleBitmap } from '@/lib/roles/decodeRoleBitmap'
import { getRoleChangeLogs } from '@/lib/roles/roleChangeLogs'
import type { RoleHistoryEntry } from '@/lib/roles/roleHistoryEntry'
import { toResourceHex } from '@/lib/roles/toResourceHex'
import { safeGetClient } from '@/lib/wagmi/helpers'

export type { RoleHistoryEntry } from '@/lib/roles/roleHistoryEntry'

class NameNotNormalizableError extends TaggedError('NameNotNormalizableError')<{
  cause: NormalizeErrorType
}> {}

class GetResourceError extends TaggedError('GetResourceError')<{
  cause: GetResourceErrorType
}> {}

type GetRoleHistoryParameters = {
  readonly name: string
  readonly registryAddress: Address
  /** Earliest block to scan. See `ROLES_FROM_BLOCK`. */
  readonly fromBlock: bigint
  /** When set, narrows to one account's changes on this name. */
  readonly account?: Address
}

export const getRoleHistory = ResultFn(async function* ({
  name,
  registryAddress,
  fromBlock,
  account,
}: GetRoleHistoryParameters) {
  // Normalized once, then used to derive the label: hashing a raw route
  // parameter would address a resource the registry never wrote to.
  const normalized = yield* fromSync(
    () => normalize(name),
    (e) => new NameNotNormalizableError({ cause: e as NormalizeErrorType }),
  )
  const { label } = makeLabelNodeAndParent(normalized)

  const client = yield* safeGetClient()

  const resource = yield* fromPromise(
    ensjs_getResource(client, { label, registryAddress }),
    (e) => new GetResourceError({ cause: e as GetResourceErrorType }),
  )

  const logs = yield* getRoleChangeLogs({
    registryAddress,
    fromBlock,
    resource,
    account,
  })

  const timestamps = yield* getBlockTimestamps({
    blocks: logs.map((log) => log.blockNumber),
  })

  const resourceHex = toResourceHex(resource)

  const entries: RoleHistoryEntry[] = logs
    .map((log) => ({
      account: log.args.account as Address,
      resource: resourceHex,
      oldRoles: decodeRoleBitmap(log.args.oldRoleBitmap ?? 0n),
      newRoles: decodeRoleBitmap(log.args.newRoleBitmap ?? 0n),
      transactionHash: log.transactionHash as Hex,
      timestamp: timestamps.get(log.blockNumber) ?? 0n,
      blockNumber: log.blockNumber,
    }))
    .toSorted((a, b) => Number(b.blockNumber - a.blockNumber))

  return ok(entries)
})

const getRoleHistoryQueryKey = createQueryKey<
  'get-role-history',
  GetRoleHistoryParameters
>('get-role-history')

export const getRoleHistoryQueryOptions = (params: GetRoleHistoryParameters) =>
  resultQueryOptions({
    queryKey: getRoleHistoryQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getRoleHistory(params),
  })
