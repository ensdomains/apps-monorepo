import { match } from 'ts-pattern'
import { maxUint64 } from 'viem'
import {
  type ExtensionSpan,
  getExtensionTargetDate,
} from '@/features/renew/utils/extensionDurationPicker'
import { SECONDS_PER_DAY } from '@/lib/constants/duration'
import { dateToPlainDate } from '@/utils/temporal'

/** A new ENSv2 subname's expiry: none of its own, or a span from today. */
export type SubnameExpiry =
  | { readonly type: 'none' }
  | { readonly type: 'span'; readonly span: ExtensionSpan }

type SubnameExpiryClock = {
  readonly today: Temporal.PlainDate
  readonly nowSeconds: bigint
}

export const DEFAULT_SUBNAME_EXPIRY: SubnameExpiry = { type: 'none' }

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

/** Whether a subname's expiry can be moved later: `renew` never shortens one, so a subname with none of its own, or one already lapsed, can't. */
export const canExtendExpiry = (
  expiryDate: Date | null | undefined,
  nowMs: number,
): expiryDate is Date => !!expiryDate && expiryDate.getTime() > nowMs

/** The registry expiry a picked span moves `expiryDate` to, counted in calendar days from its day as the picker shows it. */
export const getExtendedExpirySeconds = (
  expiryDate: Date,
  span: ExtensionSpan,
): bigint =>
  getSubnameExpirySeconds(
    { type: 'span', span },
    {
      today: dateToPlainDate(expiryDate),
      nowSeconds: BigInt(Math.floor(expiryDate.getTime() / 1000)),
    },
  )
