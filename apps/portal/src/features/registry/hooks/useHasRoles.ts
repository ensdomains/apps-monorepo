import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import type { ResolverRole } from '@ensdomains/ensjs/public/v2'
import {
  type HasRolesParameters as EnsjsHasRolesParameters,
  hasRoles as ensjsHasRoles,
} from '@ensdomains/ensjs/public/v2'
import type { Role } from '@ensdomains/ensjs/utils/v2'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import {
  safeGetClient,
  safeGetNamechainSepoliaClient,
} from '@/lib/wagmi/helpers'
import type { EnsNetworkName } from '@/utils/types'

class HasRolesError extends TaggedError('HasRolesError')<{
  cause: unknown
}> {}

type RegistryRolesParameters = {
  readonly registryAddress: Address
  readonly label: string
  readonly roles: Role[]
  readonly account: Address
  readonly network: EnsNetworkName
}

type ResolverRootRolesParameters = {
  readonly resolverAddress: Address
  readonly roles: ResolverRole[]
  readonly account: Address
  readonly network: EnsNetworkName
}

type ResolverRolesParameters = {
  readonly resolverAddress: Address
  readonly resource: bigint
  readonly roles: ResolverRole[]
  readonly account: Address
  readonly network: EnsNetworkName
}

type GetHasRolesParameters =
  | RegistryRolesParameters
  | ResolverRootRolesParameters
  | ResolverRolesParameters

const getHasRoles = ResultFn(async function* (params: GetHasRolesParameters) {
  const client =
    params.network === 'namechainSepolia'
      ? yield* safeGetNamechainSepoliaClient()
      : yield* safeGetClient()

  const { network: _, ...ensjsParams } = params

  const result = yield* await fromPromise(
    ensjsHasRoles(client, ensjsParams as EnsjsHasRolesParameters),
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
