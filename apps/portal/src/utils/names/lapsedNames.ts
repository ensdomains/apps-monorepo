import {
  type Address,
  type AddressName,
  type BignameClient,
  MAX_PAGE_SIZE,
  readAllCollectionPages,
  toExactSeconds,
} from '@ens-apps/indexer/bigname'
import {
  SECONDS_PER_DAY,
  V1_GRACE_PERIOD_DAYS,
} from '@ens-apps/utils/gracePeriod'
import { PREMIUM_PERIOD_DAYS } from '@/features/renew/utils/nameExtension'
import { isNormalizedLabel } from '@/utils/token/isNormalized'

const PREMIUM_SECONDS = BigInt(PREMIUM_PERIOD_DAYS * SECONDS_PER_DAY)
/** The longest an expired name stays listed: ENSv1 grace plus the cooldown. */
const LAPSED_WINDOW_SECONDS =
  BigInt(V1_GRACE_PERIOD_DAYS * SECONDS_PER_DAY) + PREMIUM_SECONDS

const isEth2ld = (name: string): boolean => {
  const [label, tld, ...rest] = name.split('.')
  return (
    tld === 'eth' && rest.length === 0 && !!label && isNormalizedLabel(label)
  )
}

/**
 * A `.eth` name the address held until it expired, through its grace and price
 * cooldown. bigname serves it `expired` in grace and `released` after.
 */
export const isLapsedName = (
  row: AddressName,
  address: Address,
  nowSeconds: bigint,
): boolean => {
  const expiry = toExactSeconds(row.expires_at)
  const graceEnd = toExactSeconds(row.grace_ends_at)
  return (
    (row.status === 'expired' || row.status === 'released') &&
    row.lapsed_registration?.release_kind === 'expired' &&
    row.lapsed_registration.owner?.toLowerCase() === address.toLowerCase() &&
    expiry !== null &&
    graceEnd !== null &&
    expiry <= nowSeconds &&
    nowSeconds < graceEnd + PREMIUM_SECONDS &&
    isEth2ld(row.name)
  )
}

/**
 * The address's lapsed `.eth` names, in either era. bigname drops them from
 * `relation=any` (an ENSv2 name at expiry, an ENSv1 one when grace ends), so
 * they come from a `relation=former_owner` read over the expiry window.
 */
export const readLapsedNames = (
  client: Pick<BignameClient, 'addressNames'>,
  address: Address,
  nowSeconds: bigint,
  signal?: AbortSignal,
) =>
  readAllCollectionPages(
    (cursor, pageSignal) =>
      client.addressNames(
        address,
        {
          namespace: 'ens',
          relation: 'former_owner',
          parent: 'eth',
          sort: 'expires_at',
          order: 'asc',
          expires_after: String(nowSeconds - LAPSED_WINDOW_SECONDS),
          expires_before: String(nowSeconds + 1n),
          page_size: MAX_PAGE_SIZE,
          ...(cursor !== undefined && { cursor }),
        },
        { signal: pageSignal },
      ),
    { signal },
  ).map((rows) => rows.filter((row) => isLapsedName(row, address, nowSeconds)))
