import { createBignameClient } from '@ens-apps/indexer/bigname'
import { getConfig } from '#core/config.js'
import { logger } from '#utils/logger.js'

// Reverse records are not migratable names.
const REVERSE_SUFFIX = '.addr.reverse'

// Enough rows to step past reverse records at the top of the sort.
const PAGE_SIZE = 10

/**
 * Whether `address` owns, manages or registered at least one live ENS v1
 * name, for the migration-gas drip.
 *
 * One request: the address's v1 names sorted by expiry, latest first. bigname
 * puts names with no expiry ahead of the rest in that order, and keeps
 * released names with their lapsed expiry, so the first non-reverse row
 * decides: live if it has no expiry or expires in the future.
 *
 * Throws on any failure so the caller stays fail-closed (no drip).
 */
export const hasV1Names = async (
  address: string,
  env: CloudflareBindings,
): Promise<boolean> => {
  const addr = address.toLowerCase()
  const bigname = createBignameClient(getConfig(env).endpoints.bignameApi)

  const result = await bigname.addressNames(addr, {
    relation: 'any',
    authority: 'ens_v1',
    sort: 'expires_at',
    order: 'desc',
    page_size: PAGE_SIZE,
  })
  if (result.isErr()) throw result.error

  const latest = result.value.data.find(
    (row) => !row.name.endsWith(REVERSE_SUFFIX),
  )
  const owns =
    latest !== undefined &&
    (latest.expires_at === undefined ||
      new Date(latest.expires_at) > new Date())

  logger.debug('Checked v1 name ownership', { address: addr, owns })
  return owns
}
