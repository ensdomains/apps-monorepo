import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { permissionedResolverRolesSnippet } from '@ensdomains/ensjs-abi/v2/permissionedResolver'
import { useQueries } from '@tanstack/react-query'
import { fromPromise, ok } from 'neverthrow'
import { useMemo } from 'react'
import { type Address, zeroAddress } from 'viem'
import { readContract } from 'viem/actions'
import { getAction } from 'viem/utils'
import type { ResourceId } from '@/lib/resource/resourceId'
import { isAdminRole } from '@/lib/roles/permissions'
import {
  decodeResolverRoleBitmap,
  type ResolverRole,
  ROOT_RESOURCE,
} from '@/lib/roles/resolverRoles'
import { safeGetClient } from '@/lib/wagmi/helpers'

class GetResolverRolesForAccountError extends TaggedError(
  'GetResolverRolesForAccountError',
)<{
  cause: unknown
}> {}

type GetResolverRolesForAccountParameters = {
  readonly address: Address
  readonly resource: ResourceId
  readonly account: Address
}

const getResolverRolesForAccount = ResultFn(async function* ({
  address,
  resource,
  account,
}: GetResolverRolesForAccountParameters) {
  const client = yield* safeGetClient()
  const readContractAction = getAction(client, readContract, 'readContract')

  const raw = yield* fromPromise(
    readContractAction({
      address,
      abi: permissionedResolverRolesSnippet,
      functionName: 'roles',
      args: [resource, account],
    }),
    (e) => new GetResolverRolesForAccountError({ cause: e }),
  )

  return ok(decodeResolverRoleBitmap(raw))
})

export const RESOLVER_ROLES_FOR_ACCOUNT = 'get-resolver-roles-for-account'

const getResolverRolesForAccountQueryKey = createQueryKey<
  typeof RESOLVER_ROLES_FOR_ACCOUNT,
  Record<string, unknown>
>(RESOLVER_ROLES_FOR_ACCOUNT)

const getResolverRolesForAccountQueryOptions = (
  params: GetResolverRolesForAccountParameters,
) =>
  resultQueryOptions({
    // `resource` is a bigint, which the default key hash cannot serialise.
    queryKey: getResolverRolesForAccountQueryKey({
      ...params,
      resource: params.resource.toString(),
    }),
    queryFn: () => getResolverRolesForAccount(params),
  })

type UseResolverCallerAdminRolesParameters = {
  readonly resolverAddress: Address
  /** A setter-argument resource, or `null` for root alone. */
  readonly resource: ResourceId | null
  readonly account: Address | undefined
}

/** `account`'s on-chain `_ADMIN` roles on the resolver's root ORed with `resource`'s; empty until loaded. */
export const useResolverCallerAdminRoles = ({
  resolverAddress,
  resource,
  account,
}: UseResolverCallerAdminRolesParameters): ReadonlySet<ResolverRole> => {
  const [rootRoles, resourceRoles] = useQueries({
    queries: [
      {
        ...getResolverRolesForAccountQueryOptions({
          address: resolverAddress,
          resource: ROOT_RESOURCE,
          account: account ?? zeroAddress,
        }),
        enabled: Boolean(account),
      },
      {
        ...getResolverRolesForAccountQueryOptions({
          address: resolverAddress,
          resource: resource ?? ROOT_RESOURCE,
          account: account ?? zeroAddress,
        }),
        enabled: Boolean(account) && resource !== null,
      },
    ],
  })

  const rootDecoded = rootRoles.data
  const resourceDecoded = resourceRoles.data

  return useMemo(
    () =>
      new Set<ResolverRole>(
        [...(rootDecoded ?? []), ...(resourceDecoded ?? [])].filter(
          isAdminRole,
        ),
      ),
    [rootDecoded, resourceDecoded],
  )
}
