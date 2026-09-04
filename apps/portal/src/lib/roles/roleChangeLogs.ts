/**
 * `EACRolesChanged` logs for one resource on one registry.
 *
 * `resource` and `account` are both indexed topics, so the node answers a role
 * question exactly and completely in one request: no indexer window, no paging,
 * nothing to report as truncated. Every role read in the app that used to fetch
 * a capped page and filter it client-side goes through here.
 *
 * Filtered on the single event rather than ensjs's `eacRolesEvents` array: with
 * several events viem cannot apply the indexed `args` per event, so the filter
 * widens to every role event on the registry and the RPC rejects it outright
 * ("query returns too many logs, narrow your filter").
 *
 * Logs carry no timestamp. Callers that render dates backfill block times
 * separately.
 */

import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { eacRolesChangedEventSnippet } from '@ensdomains/ensjs-abi/v2/enhancedAccessControl'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import { type GetLogsErrorType, getLogs } from 'viem/actions'
import { getAction } from 'viem/utils'
import { safeGetClient } from '@/lib/wagmi/helpers'

export class GetRoleChangeLogsError extends TaggedError(
  'GetRoleChangeLogsError',
)<{
  cause: GetLogsErrorType
}> {}

export type GetRoleChangeLogsParameters = {
  readonly registryAddress: Address
  /** Earliest block to scan. See `ROLES_FROM_BLOCK`. */
  readonly fromBlock: bigint
  readonly resource: bigint
  /** When set, narrows to one account's changes via the second topic. */
  readonly account?: Address
}

export const getRoleChangeLogs = ResultFn(async function* ({
  registryAddress,
  fromBlock,
  resource,
  account,
}: GetRoleChangeLogsParameters) {
  const client = yield* safeGetClient()

  const logs = yield* fromPromise(
    getAction(
      client,
      getLogs,
      'getLogs',
    )({
      address: registryAddress,
      event: eacRolesChangedEventSnippet[0],
      args: account ? { resource, account } : { resource },
      fromBlock,
    }),
    (e) => new GetRoleChangeLogsError({ cause: e as GetLogsErrorType }),
  )

  return ok(logs)
})
