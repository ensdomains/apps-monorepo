import {
  Domain_OrderBy,
  type DomainFilter,
  type DomainFragment,
  DomainsDocument,
  type DomainsQuery,
  type DomainsQueryVariables,
  OrderDirection,
} from '@ens-apps/indexer'
import indexerClient from '@ens-apps/indexer/urql'
import { ResultFn } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { skipToken } from '@tanstack/react-query'
import { fromPromise, ok } from 'neverthrow'
import { GetDomainsError } from './getDashboardDomains'

const PAGE_SIZE = 1000

export const getAllDomains = ResultFn(async function* (where: DomainFilter) {
  const result = yield* fromPromise(
    (async () => {
      const all: DomainFragment[] = []
      let skip = 0
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      while (true) {
        const r = await indexerClient
          .query<DomainsQuery, DomainsQueryVariables>(DomainsDocument, {
            where,
            first: PAGE_SIZE,
            skip,
            orderBy: Domain_OrderBy.Name,
            orderDirection: OrderDirection.Asc,
          })
          .toPromise()
        if (r.error) throw r.error
        if (!r.data) throw new Error('Indexer query returned no data')
        const page = r.data.domains
        all.push(...page)
        if (page.length < PAGE_SIZE) break
        skip += PAGE_SIZE
      }
      return all
    })(),
    (error) => new GetDomainsError({ cause: error }),
  )
  return ok(result)
})

export const getAllDomainsQuery = (where: DomainFilter | undefined) =>
  resultQueryOptions({
    queryKey: qk('dashboard', 'all_domains', where ?? {}),
    queryFn: where ? () => getAllDomains(where) : skipToken,
  })
