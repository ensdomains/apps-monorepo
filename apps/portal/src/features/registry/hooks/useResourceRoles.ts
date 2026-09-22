/**
 * Per-resource role checks for a list of rows, in one multicall.
 *
 * The registry-wide check that used to gate a whole table answers a different
 * question than the one the contract asks at write time: `unregister` checks
 * `ROLE_UNREGISTER` on the *subname's* resource. Gating every row on the root
 * resource let a row through that the caller has no role on — and hid rows from
 * someone granted the role on a single subname (WEB-1458).
 *
 * `EnhancedAccessControl.hasRoles` ORs the caller's root roles into every
 * resource, so one question per row still answers both "granted registry-wide"
 * and "granted on this name".
 *
 * This is the fallback, not the first question. Callers ask the single root
 * question first and only come here when the answer is `false`: viem chunks a
 * multicall at 1024 bytes and each check is 100 bytes, so a name with hundreds
 * of subnames would otherwise issue tens of `aggregate3` calls on every load
 * for an account the root answer already settled.
 */

import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { encodeRoleBitmap, type Role } from '@ensdomains/ensjs/utils/v2'
import { eacHasRolesSnippet } from '@ensdomains/ensjs-abi/v2/enhancedAccessControl'
import { fromPromise, ok } from 'neverthrow'
import type { Address, MulticallErrorType } from 'viem'
import { multicall } from 'viem/actions'
import { getAction } from 'viem/utils'
import type { ResourceId } from '@/lib/resource/resourceId'
import { safeGetClient } from '@/lib/wagmi/helpers'

export class ResourceRolesError extends TaggedError('ResourceRolesError')<{
  cause: MulticallErrorType
}> {}

export type GetResourceRolesParameters = {
  readonly registryAddress: Address
  readonly account: Address
  readonly roles: readonly Role[]
  /** Decimal ids, so the query key stays serialisable. */
  readonly resources: readonly string[]
}

/**
 * A resource -> "holds every requested role" lookup, keyed by the decimal id.
 * Absent means "no answer", which callers must treat as no permission.
 */
export type ResourceRoles = ReadonlyMap<string, boolean>

export const getResourceRoles = ResultFn(async function* ({
  registryAddress,
  account,
  roles,
  resources,
}: GetResourceRolesParameters) {
  if (resources.length === 0) return ok<ResourceRoles>(new Map())

  const client = yield* safeGetClient()
  const rolesBitmap = encodeRoleBitmap([...roles])
  const multicallAction = getAction(client, multicall, 'multicall')

  const results = yield* fromPromise(
    multicallAction({
      contracts: resources.map((resource) => ({
        address: registryAddress,
        abi: eacHasRolesSnippet,
        functionName: 'hasRoles',
        args: [BigInt(resource), rolesBitmap, account],
      })),
      allowFailure: true,
    }),
    (e) => new ResourceRolesError({ cause: e as MulticallErrorType }),
  )

  // A failed entry stays out of the map rather than defaulting to `true`:
  // an unanswered permission question is not permission.
  return ok<ResourceRoles>(
    new Map(
      results.flatMap((result, index) => {
        const resource = resources[index]
        if (result.status !== 'success' || resource === undefined) return []
        return [[resource, result.result === true] as const]
      }),
    ),
  )
})

const getResourceRolesQueryKey = createQueryKey<
  'registry-resource-roles',
  GetResourceRolesParameters
>('registry-resource-roles')

export const getResourceRolesQueryOptions = (
  params: GetResourceRolesParameters,
) =>
  resultQueryOptions({
    queryKey: getResourceRolesQueryKey(params),
    queryFn: () => getResourceRoles(params),
  })

/** True only when the lookup answered, and answered yes. */
export const holdsRolesOn = (
  lookup: ResourceRoles | undefined,
  resource: ResourceId,
): boolean => lookup?.get(resource.toString()) === true
