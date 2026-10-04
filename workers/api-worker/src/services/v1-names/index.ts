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

/** Pages per walk. Descending rows put live names first. */
const MAX_PAGES = 5

const isReverseName = (name: string) =>
  name === 'reverse' || name.endsWith('.reverse')

/**
 * The date an ENSv1 name stops being migratable: a `.eth` lease's own date
 * (`ens_v1.expires_at`), else the served expiry (a wrapped subname's wrapper
 * expiry; `ens_v1.expires_at` is `null` on subnames). From the Universal
 * Resolver cutover a reserved lease serves its ENSv2 reservation at the top
 * level, 62 days after the lease, so the top-level value alone would keep a
 * lapsed lease live.
 */
const lapseDate = (row: AddressNameRow) =>
  timestampToBigInt(row.ens_v1?.expires_at ?? row.expires_at)

const isLapsed = (row: AddressNameRow, nowSec: bigint) => {
  const expiresAt = lapseDate(row)
  return expiresAt !== undefined && expiresAt <= nowSec
}

/**
 * Whether every later row of a descending `expires_at` walk is lapsed too:
 * the walk sorts on the served expiry, which is never before the lease, so
 * once it has passed, later rows with an expiry have lapsed. Rows without an
 * expiry still follow (bigname sorts missing values smallest).
 */
const isPastServedExpiry = (row: AddressNameRow, nowSec: bigint) => {
  const expiresAt = timestampToBigInt(row.expires_at)
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

const walkV1Names = (
  bigname: BignameClient,
  address: string,
  order: 'asc' | 'desc',
) =>
  iteratePages(
    (cursor) =>
      bigname.listAddressNames(address, {
        relation: 'any',
        authority: V1_AUTHORITIES,
        sort: 'expires_at',
        order,
        page_size: MAX_PAGE_SIZE,
        cursor,
      }),
    { maxPages: MAX_PAGES },
  )

type WalkOutcome = 'found' | 'exhausted' | 'stopped'

/**
 * Walks one direction until a live migratable row is found, the rows run
 * out, or `shouldStop` says the remaining rows cannot hold one.
 */
const findLiveName = async (
  pages: ReturnType<typeof walkV1Names>,
  nowSec: bigint,
  shouldStop: (last: AddressNameRow) => boolean,
): Promise<WalkOutcome> => {
  for await (const page of pages) {
    if (page.data.some((row) => isLiveMigratableName(row, nowSec))) {
      return 'found'
    }
    const last = page.data.at(-1)
    if (last && shouldStop(last)) return 'stopped'
  }
  return 'exhausted'
}

/**
 * Whether `address` owns, manages or holds a role on at least one live,
 * migratable ENSv1 name, read from bigname's address-names collection (the
 * same source the manager's migration flow reads).
 *
 * One descending walk over both ENSv1 authorities finds live names first and
 * stops at the first lapsed expiry. Rows without an expiry sort smallest, so
 * they sit behind the lapsed ones; when the walk stopped early, an ascending
 * walk reads them from the other end, up to the first row with an expiry.
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

  const descending = await findLiveName(
    walkV1Names(bigname, address, 'desc'),
    nowSec,
    (last) => isPastServedExpiry(last, nowSec),
  )
  const owns =
    descending === 'found' ||
    (descending === 'stopped' &&
      (await findLiveName(
        walkV1Names(bigname, address, 'asc'),
        nowSec,
        (last) => last.expires_at != null,
      )) === 'found')

  logger.debug('Checked v1 name ownership', { address, owns })
  return owns
}
