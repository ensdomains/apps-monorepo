import { Domain_OrderBy, OrderDirection } from '@ens-apps/indexer'
import indexerClient, { graphqlRequest } from '@ens-apps/indexer/urql'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { fromPromise, ok } from 'neverthrow'
import {
  DOMAIN_LIST_FIELDS,
  type ListDomain,
  toListDomain,
} from '@/features/dashboard/service/queries/getDashboardDomains'
import type { V2RoleAssignment } from '@/features/dashboard/v2NameRoles'

const ADDRESS_OWNER_PAGE_SIZE = 200

type AddressOwnerDomainsAndRolesQuery = {
  readonly domains: readonly ListDomain[]
  readonly roles: readonly V2RoleAssignment[]
}

type AddressOwnerDomainsAndRolesVariables = {
  readonly where: { readonly owner: string }
  readonly account: string
  readonly first: number
  readonly orderBy: Domain_OrderBy
  readonly orderDirection: OrderDirection
}

class GetAddressOwnerDomainsAndRolesError extends TaggedError(
  'GetAddressOwnerDomainsAndRolesError',
)<{
  cause: unknown
}> {}

// The first owner page and this account's roles share one indexer request.
// Keep this raw string to avoid parsing GraphQL during workerd module load.
const AddressOwnerDomainsAndRolesDocument = /* GraphQL */ `
  query AddressOwnerDomainsAndRoles(
    $where: DomainFilter!
    $account: String!
    $first: Int
    $orderBy: Domain_orderBy
    $orderDirection: OrderDirection
  ) {
    domains(
      where: $where
      first: $first
      orderBy: $orderBy
      orderDirection: $orderDirection
    ) {
      ${DOMAIN_LIST_FIELDS}
    }
    roles(account: $account) {
      name
      roleBitmap
    }
  }
`

export const getAddressOwnerDomainsAndRoles = ResultFn(async function* (
  address: string,
  signal?: AbortSignal,
) {
  const normalizedAddress = address.toLowerCase()
  const data = yield* fromPromise(
    graphqlRequest<
      AddressOwnerDomainsAndRolesQuery,
      AddressOwnerDomainsAndRolesVariables
    >(
      indexerClient,
      AddressOwnerDomainsAndRolesDocument,
      {
        where: { owner: normalizedAddress },
        account: normalizedAddress,
        first: ADDRESS_OWNER_PAGE_SIZE,
        orderBy: Domain_OrderBy.RegistrationDate,
        orderDirection: OrderDirection.Desc,
      },
      signal,
    ),
    (cause) => new GetAddressOwnerDomainsAndRolesError({ cause }),
  )

  return ok({
    domains: data.domains.map(toListDomain),
    roleAssignments: data.roles,
  })
})
