import { readNamesForAddress } from '@ens-apps/indexer/bigname'
import type {
  NameSummary,
  Page,
  ReadNamesForAddress,
} from '@ens-apps/indexer/reads'
import { ResultFn } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { skipToken } from '@tanstack/react-query'
import { ok } from 'neverthrow'
import type { Address } from 'viem'
import { bigname } from '@/lib/bigname'

const FETCH_PAGE_SIZE = 200

/** An owned name the primary-name dialog can offer. */
export type PrimaryNameDomain = {
  readonly id: string
  readonly name: string
}

const toPrimaryNameDomain = (name: NameSummary): PrimaryNameDomain => ({
  id: name.namehash,
  name: name.name,
})

/**
 * Every owned ENSv2 name, all pages, so local search never silently omits
 * later names.
 */
export const getPrimaryNameDomains = ResultFn(async function* (
  readNames: ReadNamesForAddress,
  address: Address,
) {
  let domains: readonly PrimaryNameDomain[] = []
  let cursor: string | null = null
  do {
    const page: Page<NameSummary> = yield* readNames({
      address,
      relations: ['owner'],
      protocol: 'v2',
      sort: 'name',
      order: 'asc',
      pageSize: FETCH_PAGE_SIZE,
      ...(cursor !== null && { cursor }),
    })
    domains = [...domains, ...page.items.map(toPrimaryNameDomain)]
    cursor = page.nextCursor
  } while (cursor !== null)
  return ok(domains)
})

export const primaryNameDomainsQuery = (address: Address | undefined) =>
  resultQueryOptions({
    queryKey: qk('dashboard', 'primary_name_domains', {
      address: address?.toLowerCase(),
    }),
    queryFn: address
      ? () => getPrimaryNameDomains(readNamesForAddress(bigname), address)
      : skipToken,
  })
