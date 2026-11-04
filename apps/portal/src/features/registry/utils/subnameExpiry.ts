import { match } from 'ts-pattern'
import { maxUint64 } from 'viem'
import { getStartOfToday } from '@/features/register/utils/registrationDuration'
import {
  type ExtensionSpan,
  getExtensionDurationSeconds,
} from '@/features/renew/utils/extensionDurationPicker'

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
    .with(
      { type: 'span' },
      ({ span }) =>
        nowSeconds + BigInt(getExtensionDurationSeconds(today, span)),
    )
    .exhaustive()

/** Whether a picked expiry outlasts the parent, whose expiry stops the subname resolving first. */
export const isPastParentExpiry = (
  expiry: SubnameExpiry,
  clock: SubnameExpiryClock,
  parentExpirySeconds: bigint,
): boolean =>
  expiry.type === 'span' &&
  getSubnameExpirySeconds(expiry, clock) > parentExpirySeconds
