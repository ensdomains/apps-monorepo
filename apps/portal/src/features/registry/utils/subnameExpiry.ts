import { match } from 'ts-pattern'
import { maxUint64 } from 'viem'
import { getStartOfToday } from '@/features/register/utils/registrationDuration'
import {
  type ExtensionSpan,
  getExtensionTargetDate,
} from '@/features/renew/utils/extensionDurationPicker'
import { SECONDS_PER_DAY } from '@/lib/constants/duration'

/** A new ENSv2 subname's expiry: none of its own, or a span from today. */
export type SubnameExpiry =
  | { readonly type: 'none' }
  | { readonly type: 'span'; readonly span: ExtensionSpan }

type SubnameExpiryClock = {
  readonly today: Temporal.PlainDate
  readonly nowSeconds: bigint
}

export const DEFAULT_SUBNAME_EXPIRY: SubnameExpiry = { type: 'none' }

/** The clock read at the edge, for the pure functions below. */
export const readSubnameExpiryClock = (): SubnameExpiryClock => ({
  today: getStartOfToday(),
  nowSeconds: BigInt(Math.floor(Date.now() / 1000)),
})

/** The registry `expiry` to register with; `max(uint64)` never expires. */
export const getSubnameExpirySeconds = (
  expiry: SubnameExpiry,
  { today, nowSeconds }: SubnameExpiryClock,
): bigint =>
  match(expiry)
    .with({ type: 'none' }, () => maxUint64)
    .with({ type: 'span' }, ({ span }) => {
      // Calendar days, not renewal's contract years, so the picked day is kept.
      const { days } = today.until(getExtensionTargetDate(today, span), {
        largestUnit: 'day',
      })
      return nowSeconds + BigInt(Math.max(days, 1) * SECONDS_PER_DAY)
    })
    .exhaustive()

/** A new subname's parent and every name above it, nearest first; any of them expiring stops it resolving. */
export const getNamesAbove = (parentName: string): readonly string[] => {
  const labels = parentName.split('.')
  return Array.from({ length: labels.length - 1 }, (_, index) =>
    labels.slice(index).join('.'),
  )
}

type NameExpiry = { readonly name: string; readonly expirySeconds: bigint }

/** The name above that expires first, or null when none of them expires. */
export const getFirstToExpire = (
  names: readonly { readonly name: string; readonly expiry: number | null }[],
): NameExpiry | null =>
  names.reduce<NameExpiry | null>(
    (first, { name, expiry }) =>
      expiry === null || (first && first.expirySeconds <= BigInt(expiry))
        ? first
        : { name, expirySeconds: BigInt(expiry) },
    null,
  )

/** Whether a picked expiry outlasts the parent, whose expiry stops the subname resolving first. */
export const isPastParentExpiry = (
  expiry: SubnameExpiry,
  clock: SubnameExpiryClock,
  parentExpirySeconds: bigint,
): boolean =>
  expiry.type === 'span' &&
  getSubnameExpirySeconds(expiry, clock) > parentExpirySeconds
