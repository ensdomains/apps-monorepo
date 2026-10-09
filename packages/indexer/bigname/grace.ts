import {
  SECONDS_PER_DAY,
  V2_GRACE_PERIOD_DAYS,
} from '@ens-apps/utils/gracePeriod'
import { toExactSeconds } from './adapters'
import type { AddressName } from './types'

export const V2_GRACE_SECONDS = BigInt(V2_GRACE_PERIOD_DAYS * SECONDS_PER_DAY)

const isEth2ld = (name: string): boolean => {
  const labels = name.split('.')
  return labels.length === 2 && labels[1] === 'eth'
}

/**
 * An ENSv2 `.eth` name the address held until it expired, still renewable in
 * its grace. bigname drops it from the address's current relations, so it
 * comes from a `relation=former_owner` read.
 */
export const isInV2Grace = (
  row: AddressName,
  address: string,
  nowSeconds: bigint,
): boolean => {
  const expiry = toExactSeconds(row.expires_at)
  return (
    row.authority === 'ens_v2' &&
    row.status === 'expired' &&
    row.lapsed_registration?.release_kind === 'expired' &&
    row.lapsed_registration.owner?.toLowerCase() === address.toLowerCase() &&
    expiry !== null &&
    expiry <= nowSeconds &&
    nowSeconds < expiry + V2_GRACE_SECONDS &&
    isEth2ld(row.name)
  )
}
