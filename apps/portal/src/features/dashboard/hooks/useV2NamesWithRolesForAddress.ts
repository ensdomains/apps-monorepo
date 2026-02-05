import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { type ClientError, gql } from 'graphql-request'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import { graphqlIndexerClient } from '@/lib/indexer'

type RoleAssignment = {
  name: string | null
  roleBitmap: string
}

type DomainData = {
  name: string
  expiryDate: number | null
  subdomainCount: number
  recordCount: number
}

export type V2NameWithRoles = {
  name: string
  expiryDate: number | null
  roleBitmap: string
  subdomainCount: number
  recordCount: number
}

class GetV2NamesWithRolesForAddressError extends TaggedError(
  'GetV2NamesWithRolesForAddressError',
)<{
  cause: GetV2NamesWithRolesForAddressErrorType
}> {}

type GetV2NamesWithRolesForAddressErrorType = ClientError

type GetV2NamesWithRolesForAddressParameters = {
  address: Address
}

const getV2NamesWithRolesForAddress = ResultFn(async function* ({
  address,
}: GetV2NamesWithRolesForAddressParameters) {
  const { roles, domains } = yield* fromPromise(
    graphqlIndexerClient.request<{
      roles: RoleAssignment[]
      domains: DomainData[]
    }>(
      gql`
        query getNamesWithRolesForAddress($account: String!) {
          roles(account: $account) {
            name
            roleBitmap
          }
          domains(where: { owner: $account }) {
            name
            expiryDate
            subdomainCount
            recordCount
          }
        }
      `,
      { account: address.toLowerCase() },
    ),
    (e) =>
      new GetV2NamesWithRolesForAddressError({
        cause: e as GetV2NamesWithRolesForAddressErrorType,
      }),
  )

  const domainDataMap = new Map<
    string,
    { expiryDate: number | null; subdomainCount: number; recordCount: number }
  >()
  for (const domain of domains) {
    domainDataMap.set(domain.name, {
      expiryDate: domain.expiryDate,
      subdomainCount: domain.subdomainCount,
      recordCount: domain.recordCount,
    })
  }

  // Build a map of domain name -> role bitmap (aggregate if multiple entries)
  const rolesMap = new Map<string, string>()
  for (const role of roles) {
    if (role.name) {
      const existing = rolesMap.get(role.name)
      if (!existing || BigInt(role.roleBitmap) > BigInt(existing)) {
        rolesMap.set(role.name, role.roleBitmap)
      }
    }
  }

  // Filter out subnames (3+ labels) whose roles are inherited from a parent
  // domain the address owns. The roles query returns inherited roles from parent
  // domains, which causes subnames to appear under the parent owner's address
  // page even though a different address registered and owns them.
  // Only filter when we can confirm the role is inherited (a parent is owned),
  // so that subnames the address directly registered are preserved.
  const ownedNames = new Set(domains.map((d) => d.name))
  for (const name of rolesMap.keys()) {
    const labels = name.split('.')
    if (labels.length > 2 && !ownedNames.has(name)) {
      const hasOwnedParent = labels
        .slice(1, -1)
        .some((_, i) => ownedNames.has(labels.slice(i + 1).join('.')))
      if (hasOwnedParent) {
        rolesMap.delete(name)
      }
    }
  }

  // Fetch domain data for names in roles but missing from domains(where: { owner }).
  // This can happen when the user has roles on a domain without being the ERC1155 token owner.
  const missingNames = [...rolesMap.keys()].filter(
    (name) => !domainDataMap.has(name),
  )

  if (missingNames.length > 0) {
    const aliasedQuery = missingNames
      .map(
        (name, i) =>
          `d${i}: domain(id: ${JSON.stringify(name)}) { name expiryDate subdomainCount recordCount }`,
      )
      .join('\n')

    const missingData = yield* fromPromise(
      graphqlIndexerClient.request<Record<string, DomainData | null>>(
        gql`query { ${aliasedQuery} }`,
      ),
      (e) =>
        new GetV2NamesWithRolesForAddressError({
          cause: e as GetV2NamesWithRolesForAddressErrorType,
        }),
    )

    for (const domain of Object.values(missingData)) {
      if (domain) {
        domainDataMap.set(domain.name, {
          expiryDate: domain.expiryDate,
          subdomainCount: domain.subdomainCount,
          recordCount: domain.recordCount,
        })
      }
    }
  }

  const result: V2NameWithRoles[] = []
  for (const [name, roleBitmap] of rolesMap) {
    const domainData = domainDataMap.get(name)
    result.push({
      name,
      roleBitmap,
      expiryDate: domainData?.expiryDate ?? null,
      subdomainCount: domainData?.subdomainCount ?? 0,
      recordCount: domainData?.recordCount ?? 0,
    })
  }

  return ok(result)
})

const getV2NamesWithRolesForAddressQueryKey = createQueryKey<
  'get-v2-names-with-roles-for-address',
  GetV2NamesWithRolesForAddressParameters
>('get-v2-names-with-roles-for-address')

export const getV2NamesWithRolesForAddressQueryOptions = (
  params: GetV2NamesWithRolesForAddressParameters,
) =>
  resultQueryOptions({
    queryKey: getV2NamesWithRolesForAddressQueryKey(params),
    queryFn: ({ queryKey: [, params] }) =>
      getV2NamesWithRolesForAddress(params),
  })
