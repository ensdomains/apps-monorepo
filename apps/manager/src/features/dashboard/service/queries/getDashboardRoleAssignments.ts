import type { EacRoleAssignment } from '@ens-apps/indexer'
import { graphqlRequest } from '@ens-apps/indexer/urql'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { queryOptions, skipToken } from '@tanstack/react-query'
import { indexerClient } from '@/lib/indexer-client'
import type { V2RoleAssignment } from '../../v2NameRoles'

type DashboardRoleAssignmentsQuery = {
  readonly roles: readonly Pick<EacRoleAssignment, 'name' | 'roleBitmap'>[]
}

type DashboardRoleAssignmentsQueryVariables = {
  readonly account: string
}

export class GetDashboardRoleAssignmentsError extends TaggedError(
  'GetDashboardRoleAssignmentsError',
)<{
  cause: unknown
}> {}

// Kept as a raw string: parsing with graphql 17 at module scope opens a
// diagnostics-channel tracing span, which workerd disallows in global scope.
const DashboardRoleAssignmentsDocument = /* GraphQL */ `
  query DashboardRoleAssignments($account: String!) {
    roles(account: $account) {
      name
      roleBitmap
    }
  }
`

export const getDashboardRoleAssignments = async (
  account: string,
): Promise<V2RoleAssignment[]> => {
  try {
    const data = await graphqlRequest<
      DashboardRoleAssignmentsQuery,
      DashboardRoleAssignmentsQueryVariables
    >(indexerClient, DashboardRoleAssignmentsDocument, {
      account: account.toLowerCase(),
    })

    return data.roles.map(({ name, roleBitmap }) => ({
      name: name ?? null,
      roleBitmap,
    }))
  } catch (error) {
    throw new GetDashboardRoleAssignmentsError({ cause: error })
  }
}

export const getDashboardRoleAssignmentsForAddresses = async (
  accounts: readonly string[],
): Promise<V2RoleAssignment[]> => {
  const normalizedAccounts = Array.from(
    new Set(accounts.map((account) => account.toLowerCase())),
  )
  const roleAssignments = await Promise.all(
    normalizedAccounts.map(getDashboardRoleAssignments),
  )
  return roleAssignments.flat()
}

export const getDashboardRoleAssignmentsQuery = (
  accounts: readonly string[] | undefined,
) => {
  const normalizedAccounts = accounts?.map((account) => account.toLowerCase())

  return queryOptions({
    queryKey: qk('dashboard', 'role_assignments', {
      accounts: normalizedAccounts ?? [],
    }),
    queryFn:
      normalizedAccounts && normalizedAccounts.length > 0
        ? () => getDashboardRoleAssignmentsForAddresses(normalizedAccounts)
        : skipToken,
    meta: {
      dependsOn: ['indexer'],
    },
  })
}
