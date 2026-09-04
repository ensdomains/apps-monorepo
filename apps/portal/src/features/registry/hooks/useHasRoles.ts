import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import {
  type HasRolesParameters as EnsjsHasRolesParameters,
  hasRoles as ensjsHasRoles,
} from '@ensdomains/ensjs/public/v2'
import type { Role } from '@ensdomains/ensjs/utils/v2'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import { readContract } from 'viem/actions'
import { permissionedResolverAbi } from '@/lib/abis/permissionedResolver'
import {
  encodeResolverRoleBitmap,
  type ResolverRoleKey,
  ROOT_RESOURCE,
} from '@/lib/roles/resolverRoles'
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

type RegistryRootRolesParameters = {
  readonly registryAddress: Address
  readonly roles: Role[]
  readonly account: Address
}

/**
 * Resolver roles are checked locally against the post-audit-2 ABI: ensjs still
 * encodes the pre-refactor role bits. `resource` defaults to the root resource
 * (every name); pass a setter resource (`computeSetterResource`) to check one
 * argument scope, which the contract ORs with the root roles.
 */
type ResolverRolesParameters = {
  readonly resolverAddress: Address
  readonly resource?: bigint
  readonly roles: readonly ResolverRoleKey[]
  readonly account: Address
}

type GetHasRolesParameters =
  | RegistryRolesParameters
  | RegistryRootRolesParameters
  | ResolverRolesParameters

const isResolverParameters = (
  params: GetHasRolesParameters,
): params is ResolverRolesParameters => 'resolverAddress' in params

const getHasRoles = ResultFn(async function* (params: GetHasRolesParameters) {
  const client = yield* safeGetClient()

  if (isResolverParameters(params)) {
    const result = yield* fromPromise(
      readContract(client, {
        address: params.resolverAddress,
        abi: permissionedResolverAbi,
        functionName: 'hasRoles',
        args: [
          params.resource ?? ROOT_RESOURCE,
          encodeResolverRoleBitmap(params.roles),
          params.account,
        ],
      }),
      (e) => new HasRolesError({ cause: e }),
    )
    return ok(result)
  }

  const result = yield* fromPromise(
    ensjsHasRoles(client, params as EnsjsHasRolesParameters),
    (e) => new HasRolesError({ cause: e }),
  )

  return ok(result)
})

const hasRolesQueryKey = (params: GetHasRolesParameters) =>
  ['hasRoles', params] as const

export const getHasRolesQueryOptions = (params: GetHasRolesParameters) =>
  resultQueryOptions({
    queryKey: hasRolesQueryKey(params),
    queryFn: () => getHasRoles(params),
  })
