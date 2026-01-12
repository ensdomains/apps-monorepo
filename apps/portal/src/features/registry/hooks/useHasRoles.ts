import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { hasRoles as ensjsHasRoles } from '@ensdomains/ensjs/public/v2'
import type { Role } from '@ensdomains/ensjs/utils/v2'
import { useQuery } from '@tanstack/react-query'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import { safeGetClient } from '@/lib/wagmi/helpers'

class HasRolesError extends TaggedError('HasRolesError')<{
  cause: unknown
}> {}

type GetHasRolesParameters = {
  /** The registry address to check */
  registryAddress: Address
  /** The label to check roles for */
  label: string
  /** The roles to check */
  roles: Role[]
  /** The account address to check */
  account: Address
}

const getHasRoles = ResultFn(async function* ({
  registryAddress,
  label,
  roles,
  account,
}: GetHasRolesParameters) {
  const client = yield* safeGetClient()

  const result = yield* await fromPromise(
    ensjsHasRoles(client, {
      registryAddress,
      label,
      roles,
      account,
    }),
    (e) => new HasRolesError({ cause: e }),
  )

  return ok(result)
})

const hasRolesQueryKey = createQueryKey<'hasRoles', GetHasRolesParameters>(
  'hasRoles',
)

export const getHasRolesQueryOptions = (params: GetHasRolesParameters) =>
  resultQueryOptions({
    queryKey: hasRolesQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getHasRoles(params),
  })
