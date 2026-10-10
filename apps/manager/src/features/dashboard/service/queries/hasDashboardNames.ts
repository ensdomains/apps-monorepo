import { readNamesForAddress } from '@ens-apps/indexer/bigname'
import type {
  NameSummary,
  Page,
  ReadNamesForAddress,
} from '@ens-apps/indexer/reads'
import { readNamesPage } from '@ens-apps/indexer/reads'
import { ResultFn } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { skipToken } from '@tanstack/react-query'
import { ok } from 'neverthrow'
import type { Address } from 'viem'
import { bigname } from '@/lib/bigname'
import { isListedName } from '../../dashboardNames'

// Reverse records are the names the dashboard hides that usually come first,
// so the first page almost always decides.
const PAGE_SIZE = 50
// An address with only hidden names would otherwise be read to the end before
// the landing page shows; past this it counts as having none to list.
const MAX_PAGES = 4

/**
 * Whether the address owns a name the dashboard would list. A total count is
 * not enough: it also counts the address's reverse record and released names.
 */
export const hasDashboardNames = ResultFn(async function* (
  readNames: ReadNamesForAddress,
  address: Address,
) {
  let cursor: string | null = null
  let pages = 0
  do {
    const page: Page<NameSummary> = yield* readNamesPage(readNames, {
      address,
      relations: ['owner'],
      pageSize: PAGE_SIZE,
      ...(cursor !== null && { cursor }),
    })
    if (page.items.some(isListedName)) return ok(true)
    cursor = page.nextCursor
    pages += 1
  } while (cursor !== null && pages < MAX_PAGES)
  return ok(false)
})

export const getHasDashboardNamesQueryOptions = (
  address: Address | null | undefined,
) =>
  resultQueryOptions({
    queryKey: qk('dashboard', 'has_names', {
      address: address?.toLowerCase() ?? null,
    }),
    queryFn: address
      ? () => hasDashboardNames(readNamesForAddress(bigname), address)
      : skipToken,
  })
