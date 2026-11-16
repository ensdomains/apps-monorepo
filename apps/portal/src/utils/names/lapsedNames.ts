import {
  type Address,
  type AddressName,
  type BignameClient,
  MAX_PAGE_SIZE,
  readAllCollectionPages,
  toExpirySeconds,
} from '@ens-apps/indexer/bigname'
import { SECONDS_PER_DAY } from '@ens-apps/utils/gracePeriod'
import { isNormalizedLabel } from '@/utils/token/isNormalized'

/**
 * How long a name the address let expire stays listed, counted from its expiry
 * (for an ENSv1 name, its registrar lease rather than its ENSv2 reservation).
 */
const LAPSED_LISTED_DAYS = 30
const LAPSED_WINDOW_SECONDS = BigInt(LAPSED_LISTED_DAYS * SECONDS_PER_DAY)

const isEth2ld = (name: string): boolean => {
  const [label, tld, ...rest] = name.split('.')
  return (
    tld === 'eth' && rest.length === 0 && !!label && isNormalizedLabel(label)
  )
}

/**
 * A `.eth` name the address held until it expired, for 30 days after expiry.
 * bigname serves it `expired` in grace and `released` after; once registered
 * again it is neither.
 */
export const isLapsedName = (
  row: AddressName,
  address: Address,
  nowSeconds: bigint,
): boolean => {
  const expiry = toExpirySeconds(row)
  return (
    (row.status === 'expired' || row.status === 'released') &&
    row.lapsed_registration?.release_kind === 'expired' &&
    row.lapsed_registration.owner?.toLowerCase() === address.toLowerCase() &&
    expiry !== null &&
    expiry <= nowSeconds &&
    nowSeconds < expiry + LAPSED_WINDOW_SECONDS &&
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
