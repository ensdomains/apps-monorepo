import {
  SECONDS_PER_DAY,
  V2_GRACE_PERIOD_DAYS,
} from '@ens-apps/utils/gracePeriod'
import { Result } from 'neverthrow'
import { normalize } from 'viem/ens'
import { toExactSeconds } from './adapters'
import type { BignameClient } from './client'
import { readAllCollectionPages } from './paging'
import { MAX_PAGE_SIZE } from './time'
import type { Address, AddressName } from './types'

export const V2_GRACE_SECONDS = BigInt(V2_GRACE_PERIOD_DAYS * SECONDS_PER_DAY)

const isNormalized = Result.fromThrowable(
  (label: string) => normalize(label) === label,
)

/**
 * A `.eth` second-level name with a normalized label. bigname serves a
 * bracketed labelhash for a label it has no text for, which is no renewable name.
 */
const isEth2ld = (name: string): boolean => {
  const [label, tld, ...rest] = name.split('.')
  return (
    tld === 'eth' &&
    rest.length === 0 &&
    !!label &&
    isNormalized(label).unwrapOr(false)
  )
}

/**
 * An ENSv2 `.eth` name the address held until it expired, still renewable in
 * its grace. bigname drops it from the address's current relations, so it
 * comes from a `relation=former_owner` read.
 */
export const isInV2Grace = (
  row: AddressName,
  address: Address,
  nowSeconds: bigint,
): boolean => {
  const expiry = toExactSeconds(row.expires_at)
  const graceEnd = toExactSeconds(row.grace_ends_at)
  return (
    row.authority === 'ens_v2' &&
    row.status === 'expired' &&
    row.lapsed_registration?.release_kind === 'expired' &&
    row.lapsed_registration.owner?.toLowerCase() === address.toLowerCase() &&
    expiry !== null &&
    graceEnd !== null &&
    expiry <= nowSeconds &&
    nowSeconds < graceEnd &&
    isEth2ld(row.name)
  )
}

/**
 * Every ENSv2 `.eth` name the address can still renew in grace. bigname has no
 * grace-end filter, so the expiry window narrows the read and `isInV2Grace`
 * decides each row from its `grace_ends_at`.
 */
export const readGraceNames = (
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
          expires_after: String(nowSeconds - V2_GRACE_SECONDS),
          expires_before: String(nowSeconds + 1n),
          page_size: MAX_PAGE_SIZE,
          ...(cursor !== undefined && { cursor }),
        },
        { signal: pageSignal },
      ),
    { signal },
  ).map((rows) => rows.filter((row) => isInV2Grace(row, address, nowSeconds)))
