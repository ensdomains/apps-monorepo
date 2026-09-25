import type { DomainFragment } from '@ens-apps/indexer'
import { Domain_OrderBy, OrderDirection } from '@ens-apps/indexer'
import { ResultFn } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { skipToken } from '@tanstack/react-query'
import { ok } from 'neverthrow'
import type { Address } from 'viem'
import { getListDomains } from '@/features/dashboard/service/queries/getDashboardDomains'
import { getManagedOnlyRoleNames } from '@/features/dashboard/v2NameRoles'
import { getV1NamesForAddress } from '@/features/migration/service/v1SubgraphClient'
import {
  buildProfileAddressNames,
  type ProfileAddressName,
} from './buildProfileAddressNames'
import { getAddressOwnerDomainsAndRoles } from './getAddressOwnerDomainsAndRoles'

export { PROFILE_NAMES_PAGE_SIZE } from './profileOwnedNames'

const V2_NAMES_PAGE_SIZE = 200
const MANAGED_NAMES_CHUNK_SIZE = 50
const MANAGED_NAMES_CONCURRENCY = 4

const fetchAllV2DomainsForAddress = ResultFn(async function* (
  normalizedAddress: string,
  signal?: AbortSignal,
) {
  const firstPage = yield* getAddressOwnerDomainsAndRoles(
    normalizedAddress,
    signal,
  )
  const domains: DomainFragment[] = [...firstPage.domains]
  let pageLength = firstPage.domains.length
  let skip = pageLength

  while (pageLength === V2_NAMES_PAGE_SIZE) {
    const page = yield* getListDomains(
      {
        where: { owner: normalizedAddress },
        first: V2_NAMES_PAGE_SIZE,
        skip,
        orderBy: Domain_OrderBy.RegistrationDate,
        orderDirection: OrderDirection.Desc,
      },
      signal,
    )

    domains.push(...page.domains)
    pageLength = page.domains.length
    skip += pageLength
  }

  return ok({ domains, roleAssignments: firstPage.roleAssignments })
})

const fetchDomainsByNames = ResultFn(async function* (
  names: readonly string[],
  signal?: AbortSignal,
) {
  if (names.length === 0) return ok([] as DomainFragment[])

  const domains: DomainFragment[] = []
  const chunks: string[][] = []
  for (let i = 0; i < names.length; i += MANAGED_NAMES_CHUNK_SIZE) {
    chunks.push(names.slice(i, i + MANAGED_NAMES_CHUNK_SIZE))
  }

  for (let i = 0; i < chunks.length; i += MANAGED_NAMES_CONCURRENCY) {
    const batch = chunks.slice(i, i + MANAGED_NAMES_CONCURRENCY)
    const pages = await Promise.all(
      batch.map((chunk) =>
        getListDomains(
          { where: { name_in: chunk }, first: chunk.length },
          signal,
        ),
      ),
    )
    for (const pageResult of pages) {
      const page = yield* pageResult
      domains.push(...page.domains)
    }
  }

  return ok(domains)
})

export const getProfileAddressNames = ResultFn(async function* (
  address: Address,
  signal?: AbortSignal,
) {
  const normalizedAddress = address.toLowerCase()

  const [v1Result, v2Result] = await Promise.all([
    getV1NamesForAddress(normalizedAddress, { signal }),
    fetchAllV2DomainsForAddress(normalizedAddress, signal),
  ])
  const v1Domains = yield* v1Result
  const { domains: v2Domains, roleAssignments } = yield* v2Result

  const managedOnlyNames = getManagedOnlyRoleNames(v2Domains, roleAssignments)
  const managedV2Domains = yield* fetchDomainsByNames(managedOnlyNames, signal)

  const names = buildProfileAddressNames({
    address: normalizedAddress,
    v1Domains,
    v2Domains,
    managedV2Domains,
    roleAssignments,
  })

  return ok(names)
})

export const profileAddressNamesQuery = (address?: Address) =>
  resultQueryOptions({
    queryKey: qk('profile', 'address_names', {
      address: address?.toLowerCase(),
    }),
    queryFn: address
      ? ({ signal }) => getProfileAddressNames(address, signal)
      : skipToken,
    staleTime: 60_000,
    meta: {
      dependsOn: ['indexer'],
    },
  })

export type { ProfileAddressName }
