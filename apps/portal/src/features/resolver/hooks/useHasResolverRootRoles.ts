import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import type { ResolverRole } from '@ensdomains/ensjs/public/v2'
import { hasResolverRootRoles as ensjsHasResolverRootRoles } from '@ensdomains/ensjs/public/v2'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import { safeGetNamechainSepoliaClient } from '@/lib/wagmi/helpers'

class HasResolverRootRolesError extends TaggedError(
  'HasResolverRootRolesError',
)<{
  cause: unknown
}> {}

type GetHasResolverRootRolesParameters = {
  readonly resolverAddress: Address
  readonly roles: ResolverRole[]
  readonly account: Address
}

const getHasResolverRootRoles = ResultFn(async function* ({
  resolverAddress,
  roles,
  account,
}: GetHasResolverRootRolesParameters) {
  const client = yield* safeGetNamechainSepoliaClient()

  const result = yield* await fromPromise(
    ensjsHasResolverRootRoles(client, {
      resolverAddress,
      roles,
      account,
    }),
    (e) => new HasResolverRootRolesError({ cause: e }),
  )

  return ok(result)
})

const hasResolverRootRolesQueryKey = createQueryKey<
  'hasResolverRootRoles',
  GetHasResolverRootRolesParameters
>('hasResolverRootRoles')

export const getHasResolverRootRolesQueryOptions = (
  params: GetHasResolverRootRolesParameters,
) =>
  resultQueryOptions({
    queryKey: hasResolverRootRolesQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getHasResolverRootRoles(params),
  })
