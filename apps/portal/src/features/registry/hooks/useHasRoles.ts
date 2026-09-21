import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import {
  type HasRolesParameters as EnsjsHasRolesParameters,
  hasRoles as ensjsHasRoles,
} from '@ensdomains/ensjs/public/v2'
import type { ResolverRole, Role } from '@ensdomains/ensjs/utils/v2'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
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
  | RegistryRootRolesParameters
  | ResolverRolesParameters

const getHasRoles = ResultFn(async function* (params: GetHasRolesParameters) {
  const client = yield* safeGetClient()

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
