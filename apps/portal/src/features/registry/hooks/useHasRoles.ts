import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  type HasRolesParameters as EnsjsHasRolesParameters,
  hasRoles as ensjsHasRoles,
} from '@ensdomains/ensjs/public/v2'
import {
  encodeRoleBitmap,
  type ResolverRole,
  type Role,
} from '@ensdomains/ensjs/utils/v2'
import { eacHasRolesSnippet } from '@ensdomains/ensjs-abi/v2/enhancedAccessControl'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import { readContract } from 'viem/actions'
import { getAction } from 'viem/utils'
import type { ResourceId } from '@/lib/resource/resourceId'
import { safeGetClient } from '@/lib/wagmi/helpers'

class HasRolesError extends TaggedError('HasRolesError')<{
  cause: unknown
}> {}

type RegistryRolesParameters = {
  readonly registryAddress: Address
  readonly label: string
  readonly roles: Role[]
  readonly account: Address
}

/**
 * The same question as {@link RegistryRolesParameters}, asked with the name's
 * id instead of its label.
 *
 * Preferred wherever the answer gates a write: a label is hashed by
 * `labelhash`, which passes an encoded (`[<64 hex>]`) label straight through
 * rather than hashing it, so a gate asked by label can answer about a different
 * name than the one on screen (WEB-1458). A {@link ResourceId} can only come
 * from a fail-closed conversion.
 */
type RegistryResourceRolesParameters = {
  readonly registryAddress: Address
  /**
   * `null` when the name's id could not be established. The answer is then a
   * flat `false`: an unresolvable resource must never widen into a check that
   * passes, and it must never fall back to the root resource.
   */
  readonly resource: ResourceId | null
  readonly roles: Role[]
  readonly account: Address
}

type RegistryRootRolesParameters = {
  readonly registryAddress: Address
  readonly roles: Role[]
  readonly account: Address
}

/**
 * Resolver roles are held on the root resource (every name) or on one setter
 * argument's resource; there is no per-name scope. Omit `resource` for root;
 * pass `computeResolverResource(scope)` to check one argument, which the
 * contract ORs with the caller's root roles.
 */
type ResolverRolesParameters = {
  readonly resolverAddress: Address
  readonly resource?: bigint
  readonly roles: readonly ResolverRole[]
  readonly account: Address
}

type GetHasRolesParameters =
  | RegistryRolesParameters
  | RegistryResourceRolesParameters
  | RegistryRootRolesParameters
  | ResolverRolesParameters

const isRegistryResourceQuery = (
  params: GetHasRolesParameters,
): params is RegistryResourceRolesParameters =>
  'registryAddress' in params && 'resource' in params

const getHasRoles = ResultFn(async function* (params: GetHasRolesParameters) {
  const client = yield* safeGetClient()

  // ensjs' registry mode only takes a label, so the id path reads the
  // EnhancedAccessControl check directly. Same contract call ensjs would make,
  // with the resource supplied rather than re-derived.
  if (isRegistryResourceQuery(params)) {
    const { registryAddress, resource, roles, account } = params
    if (resource === null) return ok(false)

    const readContractAction = getAction(client, readContract, 'readContract')

    const result = yield* fromPromise(
      readContractAction({
        address: registryAddress,
        abi: eacHasRolesSnippet,
        functionName: 'hasRoles',
        args: [resource, encodeRoleBitmap(roles), account],
      }),
      (e) => new HasRolesError({ cause: e }),
    )

    return ok(result as boolean)
  }

  const result = yield* fromPromise(
    ensjsHasRoles(client, params as EnsjsHasRolesParameters),
    (e) => new HasRolesError({ cause: e }),
  )

  return ok(result)
})

const hasRolesQueryKey = createQueryKey<'hasRoles', Record<string, unknown>>(
  'hasRoles',
)

export const getHasRolesQueryOptions = (params: GetHasRolesParameters) =>
  resultQueryOptions({
    // `resource` is a bigint, which the default key hash cannot serialise, so
    // the key carries its decimal form while the params keep the typed value.
    queryKey: hasRolesQueryKey({
      ...params,
      ...('resource' in params
        ? { resource: params.resource?.toString() ?? null }
        : {}),
    }),
    queryFn: () => getHasRoles(params),
  })
