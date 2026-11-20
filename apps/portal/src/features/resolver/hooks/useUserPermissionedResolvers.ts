import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { eacRolesChangedEventSnippet } from '@ensdomains/ensjs-abi/v2/enhancedAccessControl'
import { skipToken } from '@tanstack/react-query'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import { type GetLogsErrorType, getLogs } from 'viem/actions'
import { getAction } from 'viem/utils'
import {
  isVerifiedPermissionedResolver,
  selectContractsHoldingRoles,
} from '@/features/resolver/utils/permissionedResolver'
import {
  encodeResolverRoleBitmap,
  ROOT_RESOURCE,
  resolverAdminRoleOf,
  resolverPermissions,
} from '@/lib/roles/resolverRoles'
import { ROLES_FROM_BLOCK } from '@/lib/roles/rolesFromBlock'
import { safeGetClient } from '@/lib/wagmi/helpers'

/** Every `_ADMIN` role, which both the Explorer's and the Manager's deploys grant the wallet. */
const RESOLVER_ADMIN_ROLES_BITMAP = encodeResolverRoleBitmap(
  resolverPermissions.map(({ key }) => resolverAdminRoleOf(key)),
)

class GetUserRoleLogsError extends TaggedError('GetUserRoleLogsError')<{
  cause: GetLogsErrorType
}> {}

class VerifyPermissionedResolversError extends TaggedError(
  'VerifyPermissionedResolversError',
)<{
  cause: unknown
}> {}

interface GetUserPermissionedResolversParams {
  readonly account: Address
}

// Any contract can emit a role event naming `account`, so each candidate must pass the factory's verification.
export const getUserPermissionedResolvers = ResultFn(async function* ({
  account,
}: GetUserPermissionedResolversParams) {
  const client = yield* safeGetClient()

  const logs = yield* fromPromise(
    getAction(
      client,
      getLogs,
      'getLogs',
    )({
      event: eacRolesChangedEventSnippet[0],
      args: { resource: ROOT_RESOURCE, account },
      // No resolver of the current implementation predates the v2 registries.
      fromBlock: ROLES_FROM_BLOCK,
      strict: true,
    }),
    (e) => new GetUserRoleLogsError({ cause: e as GetLogsErrorType }),
  )

  const candidates = selectContractsHoldingRoles(
    logs,
    RESOLVER_ADMIN_ROLES_BITMAP,
  )

  const verified = yield* fromPromise(
    Promise.all(
      candidates.map((address) =>
        isVerifiedPermissionedResolver({ client, address }),
      ),
    ),
    (e) => new VerifyPermissionedResolversError({ cause: e }),
  )

  return ok(candidates.filter((_, index) => verified[index]))
})

export const userPermissionedResolversQueryKey = createQueryKey<
  'user-permissioned-resolvers',
  { readonly account: Address | undefined }
>('user-permissioned-resolvers')

export const getUserPermissionedResolversQueryOptions = ({
  account,
}: {
  readonly account: Address | undefined
}) =>
  resultQueryOptions({
    queryKey: userPermissionedResolversQueryKey({ account }),
    queryFn: account
      ? () => getUserPermissionedResolvers({ account })
      : skipToken,
  })
