import {
  type AddressNameRow,
  type Authority,
  type BignameClient,
  iteratePages,
  MAX_PAGE_SIZE,
  timestampToBigInt,
} from '@ens-apps/bigname'
import { createBigname } from '#core/bigname/index.js'
import { logger } from '#utils/logger.js'

/**
 * Both are ENSv1 names the migration flow can move: `ens_v0` only means the
 * node's registry record still sits in the 2017 registry, and bigname derives
 * its registration and control exactly as for `ens_v1`. Migrated names are
 * `ens_v2`, so the filter does not match them.
 */
const V1_AUTHORITIES = ['ens_v1', 'ens_v0'] as const satisfies Authority[]

const isReverseName = (name: string) =>
  name === 'reverse' || name.endsWith('.reverse')

/**
 * The date an ENSv1 name stops being migratable: a `.eth` lease's own date
 * (`ens_v1.expires_at`), else the served expiry (a wrapped subname's wrapper
 * expiry; `ens_v1.expires_at` is `null` on subnames). From the Universal
 * Resolver cutover a reserved lease serves its ENSv2 reservation at the top
 * level. That date can differ from the lease, so it cannot decide whether
 * the lease is live.
 */
const lapseDate = (row: AddressNameRow) =>
  timestampToBigInt(row.ens_v1?.expires_at ?? row.expires_at)

const isLapsed = (row: AddressNameRow, nowSec: bigint) => {
  const expiresAt = lapseDate(row)
  return expiresAt !== undefined && expiresAt <= nowSec
}

/**
 * A name the owner can still migrate: not a reverse record, not released or
 * ownerless, and not past its expiry (a name without an expiry, such as an
 * unwrapped subname, counts as live).
 */
const isLiveMigratableName = (row: AddressNameRow, nowSec: bigint) =>
  !isReverseName(row.name) &&
  row.registration_status !== 'released' &&
  row.registration_status !== 'unregistered' &&
  !isLapsed(row, nowSec)

const walkV1Names = (bigname: BignameClient, address: string) =>
  iteratePages(
    (cursor) =>
      bigname.listAddressNames(address, {
        relation: 'any',
        authority: V1_AUTHORITIES,
        sort: 'expires_at',
        order: 'desc',
        page_size: MAX_PAGE_SIZE,
        cursor,
      }),
    { maxPages: Number.POSITIVE_INFINITY },
  )

/**
 * Whether `address` owns, manages or holds a role on at least one live,
 * migratable ENSv1 name, read from bigname's address-names collection (the
 * same source the manager's migration flow reads).
 *
 * A descending walk over both ENSv1 authorities returns at the first match.
 * Only a completed collection proves there is none: rows sort by the served
 * reservation expiry, while eligibility can depend on the different lease
 * date, and names without an expiry can follow any finite dates. Do not cap
 * the walk or infer eligibility of unseen names from a page's last row.
 *
 * Throws `BignameError` on any failed read so callers can decide the failure
 * mode (the faucet treats a failed check as "no drip", fail-closed).
 */
export const hasV1Names = async (
  env: CloudflareBindings,
  address: string,
): Promise<boolean> => {
  const bigname = createBigname(env)
  const nowSec = BigInt(Math.floor(Date.now() / 1000))

  for await (const page of walkV1Names(bigname, address)) {
    if (page.data.some((row) => isLiveMigratableName(row, nowSec))) {
      logger.debug('Checked v1 name ownership', { address, owns: true })
      return true
    }
  }

  const owns = false
  logger.debug('Checked v1 name ownership', { address, owns })
  return owns
}
