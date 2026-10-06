import {
  Domain_OrderBy,
  type DomainsQuery,
  OrderDirection,
} from '@ens-apps/indexer'
import { ResultFn } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { skipToken } from '@tanstack/react-query'
import { ok } from 'neverthrow'
import { getDomains } from './getDashboardDomains'

const FETCH_PAGE_SIZE = 200

/** Fetch every ownership page so local search never silently omits later names. */
export const getPrimaryNameDomains = ResultFn(async function* (
  address: string,
) {
  let domains: DomainsQuery['domains'] = []
  let skip = 0
  while (true) {
    const page = yield* getDomains({
      where: { owner: address.toLowerCase() },
      first: FETCH_PAGE_SIZE,
      skip,
      orderBy: Domain_OrderBy.Name,
      orderDirection: OrderDirection.Asc,
    })
    domains = domains.concat(page.domains)
    if (page.domains.length < FETCH_PAGE_SIZE) return ok(domains)
    skip += FETCH_PAGE_SIZE
  }
})

export const primaryNameDomainsQuery = (address: string | undefined) =>
  resultQueryOptions({
    queryKey: qk('dashboard', 'primary_name_domains', {
      address: address?.toLowerCase(),
    }),
    queryFn: address ? () => getPrimaryNameDomains(address) : skipToken,
  })
