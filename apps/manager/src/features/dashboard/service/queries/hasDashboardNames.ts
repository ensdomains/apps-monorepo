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

const PAGE_SIZE = 50
// Reverse records are the names the dashboard hides that usually come first,
// so the first page almost always decides.
const MAX_PAGES = 4

const HIDDEN_STATUSES: readonly NameSummary['registrationStatus'][] = [
  'released',
  'unregistered',
]

const isListed = (name: NameSummary): boolean =>
  !name.name.endsWith('.reverse') &&
  !HIDDEN_STATUSES.includes(name.registrationStatus)

/**
 * Whether the address owns a name the dashboard would list. A total count is
 * not enough: it also counts the address's reverse record and released names.
 */
export const hasDashboardNames = ResultFn(async function* (
  readNames: ReadNamesForAddress,
  address: Address,
) {
  let cursor: string | null = null
  for (let read = 0; read < MAX_PAGES; read++) {
    const page: Page<NameSummary> = yield* readNames({
      address,
      relations: ['owner'],
      pageSize: PAGE_SIZE,
      ...(cursor !== null && { cursor }),
    })
    if (page.items.some(isListed)) return ok(true)
    if (page.nextCursor === null) return ok(false)
    cursor = page.nextCursor
  }
  return ok(false)
})

export const hasDashboardNamesQuery = (address: Address | null | undefined) =>
  resultQueryOptions({
    queryKey: qk('dashboard', 'has_names', {
      address: address?.toLowerCase() ?? null,
    }),
    queryFn: address
      ? () => hasDashboardNames(readNamesForAddress(bigname), address)
      : skipToken,
  })
