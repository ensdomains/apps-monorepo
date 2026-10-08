import {
  type AddressName,
  type AddressNamesResponse,
  createBignameClient,
  toUnixSeconds,
} from '@ens-apps/indexer/bigname'
import { getConfig } from '#core/config.js'
import { logger } from '#utils/logger.js'

const PAGE_SIZE = 200
const MS_PER_SECOND = 1000

const isReverseName = (name: string) =>
  name === 'reverse' || name.endsWith('.reverse')

/**
 * The date an ENSv1 name stops being migratable: a `.eth` lease's own date,
 * else the served expiry. A reserved lease serves its ENSv2 reservation at the
 * top level, which can differ from the lease the migration checks.
 */
const lapseSeconds = (row: AddressName) =>
  toUnixSeconds(row.ens_v1?.expires_at ?? row.expires_at)

/**
 * A name the owner can still migrate: not a reverse record, not released or
 * unregistered, and not past its expiry. A name with no expiry counts as live.
 * A name in grace does not: the migration rejects an expired lease.
 */
const isLiveMigratableName = (row: AddressName, nowSec: number) => {
  if (isReverseName(row.name)) return false
  if (
    row.registration_status === 'released' ||
    row.registration_status === 'unregistered'
  ) {
    return false
  }
  const lapse = lapseSeconds(row)
  return lapse === null || lapse > nowSec
}

/**
 * Whether `address` owns, manages or registered at least one live, migratable
 * ENS v1 name, for the migration-gas drip.
 *
 * The walk returns at the first match, but only a completed walk proves there
 * is none: rows sort by the served expiry while eligibility depends on the
 * lease, and names without an expiry can sort anywhere.
 *
 * Throws on any failure so the caller stays fail-closed (no drip).
 */
export const hasV1Names = async (
  address: string,
  env: CloudflareBindings,
): Promise<boolean> => {
  const addr = address.toLowerCase()
  const bigname = createBignameClient(getConfig(env).endpoints.bignameApi)
  const nowSec = Date.now() / MS_PER_SECOND

  let cursor: string | null = null
  do {
    const result = await bigname.addressNames(addr, {
      relation: 'any',
      authority: ['ens_v1', 'ens_v0'],
      sort: 'expires_at',
      order: 'desc',
      page_size: PAGE_SIZE,
      ...(cursor !== null && { cursor }),
    })
    if (result.isErr()) throw result.error
    const page: AddressNamesResponse = result.value
    if (page.data.some((row) => isLiveMigratableName(row, nowSec))) {
      logger.debug('Checked v1 name ownership', { address: addr, owns: true })
      return true
    }
    cursor = page.page?.has_more ? (page.page.next_cursor ?? null) : null
  } while (cursor !== null)

  logger.debug('Checked v1 name ownership', { address: addr, owns: false })
  return false
}
