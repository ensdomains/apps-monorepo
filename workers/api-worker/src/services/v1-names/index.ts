import {
  type AddressNameRow,
  type Authority,
  iteratePages,
  MAX_PAGE_SIZE,
  parseTimestamp,
} from '@ens-apps/bigname'
import { createBigname } from '#core/bigname/index.js'
import { logger } from '#utils/logger.js'

/**
 * Both are ENSv1 names the migration flow can move: `ens_v0` only means the
 * node's registry record still sits in the 2017 registry, and bigname derives
 * its registration and control exactly as for `ens_v1`. Migrated names are
 * `ens_v2`, so neither filter matches them.
 */
const V1_AUTHORITIES = ['ens_v1', 'ens_v0'] as const satisfies Authority[]

/** Pages per authority. Rows are sorted so live names come first. */
const MAX_PAGES = 5

const isReverseName = (name: string) =>
  name === 'reverse' || name.endsWith('.reverse')

const isLapsed = (row: AddressNameRow, nowMs: number) => {
  const expiresAt = parseTimestamp(row.expires_at)
  return expiresAt !== undefined && expiresAt.getTime() <= nowMs
}

/**
 * A name the owner can still migrate: not a reverse record, not released or
 * ownerless, and not past its expiry (a name without an expiry, such as an
 * unwrapped subname, counts as live).
 */
const isLiveMigratableName = (row: AddressNameRow, nowMs: number) =>
  !isReverseName(row.name) &&
  row.registration_status !== 'released' &&
  row.registration_status !== 'unregistered' &&
  !isLapsed(row, nowMs)

/**
 * Whether `address` owns, manages or is the registrant of at least one live,
 * migratable ENSv1 name, read from bigname's address-names collection (the
 * same source the manager's migration flow reads).
 *
 * Throws `BignameError` on any failed read so callers can decide the failure
 * mode (the faucet treats a failed check as "no drip", fail-closed).
 */
export const hasV1Names = async (
  env: CloudflareBindings,
  address: string,
): Promise<boolean> => {
  const bigname = createBigname(env)
  const nowMs = Date.now()

  for (const authority of V1_AUTHORITIES) {
    const pages = iteratePages(
      (cursor) =>
        bigname.listAddressNames(address, {
          relation: 'any',
          authority,
          // Unknown expiries sort first descending, then the latest expiries.
          sort: 'expires_at',
          order: 'desc',
          page_size: MAX_PAGE_SIZE,
          cursor,
        }),
      { maxPages: MAX_PAGES },
    )

    for await (const page of pages) {
      if (page.data.some((row) => isLiveMigratableName(row, nowMs))) {
        logger.debug('Checked v1 name ownership', {
          address,
          authority,
          owns: true,
        })
        return true
      }
      // Every later row expires no later than this one.
      const last = page.data.at(-1)
      if (last && isLapsed(last, nowMs)) break
    }
  }

  logger.debug('Checked v1 name ownership', { address, owns: false })
  return false
}
