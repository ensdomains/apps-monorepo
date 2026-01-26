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
}

export type V2NameWithRoles = {
  name: string
  expiryDate: number | null
  roleBitmap: string
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

  // Build a map of domain name -> expiry date
  const expiryMap = new Map<string, number | null>()
  for (const domain of domains) {
    expiryMap.set(domain.name, domain.expiryDate)
  }

  // Build a map of domain name -> role bitmap (aggregate if multiple entries)
  const rolesMap = new Map<string, string>()
  for (const role of roles) {
    if (role.name) {
      // If there are multiple role entries for the same name, keep the one with most roles
      // (in practice they should be the same, but just in case)
      const existing = rolesMap.get(role.name)
      if (!existing || BigInt(role.roleBitmap) > BigInt(existing)) {
        rolesMap.set(role.name, role.roleBitmap)
      }
    }
  }

  // Merge: use roles as primary source (shows all names where user has any role)
  const result: V2NameWithRoles[] = []
  for (const [name, roleBitmap] of rolesMap) {
    result.push({
      name,
      roleBitmap,
      expiryDate: expiryMap.get(name) ?? null,
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
