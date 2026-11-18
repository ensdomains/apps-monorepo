import { match } from 'ts-pattern'
import { maxUint64 } from 'viem'
import {
  holdsRolesOn,
  type ResourceRoles,
} from '@/features/registry/hooks/useResourceRoles'
import {
  type ExtensionSpan,
  getExtensionTargetDate,
} from '@/features/renew/utils/extensionDurationPicker'
import { SECONDS_PER_DAY } from '@/lib/constants/duration'
import type { ResourceId } from '@/lib/resource/resourceId'
import { unixSecondsToPlainDateUtc } from '@/utils/temporal'

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

/** The registry expiry a picked span moves `expiryDate` to, counted in calendar days from its UTC day, the day the dialog shows. */
export const getExtendedExpirySeconds = (
  expiryDate: Date,
  span: ExtensionSpan,
): bigint => {
  const expirySeconds = Math.floor(expiryDate.getTime() / 1000)
  return getSubnameExpirySeconds(
    { type: 'span', span },
    {
      today: unixSecondsToPlainDateUtc(expirySeconds),
      nowSeconds: BigInt(expirySeconds),
    },
  )
}

/** Whether the account can move a subname's expiry later: it has an id and an unlapsed expiry of its own, and the account holds ROLE_RENEW on the registry or on it. */
export const canChangeSubnameExpiration = ({
  resourceId,
  expiryDate,
  nowMs,
  hasRootRenewRole,
  perRowRenewRoles,
}: {
  readonly resourceId: ResourceId | null
  readonly expiryDate: Date | null | undefined
  readonly nowMs: number
  readonly hasRootRenewRole: boolean | undefined
  readonly perRowRenewRoles: ResourceRoles | undefined
}): boolean =>
  resourceId !== null &&
  canExtendExpiry(expiryDate, nowMs) &&
  (hasRootRenewRole === true || holdsRolesOn(perRowRenewRoles, resourceId))

/** Why a subname's expiration can't be changed: with none of its own it lasts as long as `expiresWithName`, so that's what to extend. */
export const getChangeExpirationBlockedReason = ({
  expiryDate,
  canRenew,
  expiresWithName,
}: {
  readonly expiryDate: Date | null | undefined
  readonly canRenew: boolean
  readonly expiresWithName: string | undefined
}): string | undefined =>
  canRenew && expiryDate === null && expiresWithName
    ? `This subname has no expiration date of its own. It stays active as long as ${expiresWithName} does. To keep it longer, extend ${expiresWithName}.`
    : undefined

/** What a subname's own expiry offers an account: a change, why it can't change, or nothing. */
type ExpiryChange =
  | { readonly type: 'change'; readonly expiryDate: Date }
  | { readonly type: 'blocked'; readonly reason: string }
  | { readonly type: 'none' }

/** The change a renewer gets for one subname; `expiryDate` is undefined until its own expiry is read. */
export const getExpiryChange = ({
  expiryDate,
  nowMs,
  canRenew,
  expiresWithName,
}: {
  readonly expiryDate: Date | null | undefined
  readonly nowMs: number
  readonly canRenew: boolean
  readonly expiresWithName: string | undefined
}): ExpiryChange => {
  if (canRenew && canExtendExpiry(expiryDate, nowMs))
    return { type: 'change', expiryDate }
  const reason = getChangeExpirationBlockedReason({
    expiryDate,
    canRenew,
    expiresWithName,
  })
  return reason ? { type: 'blocked', reason } : { type: 'none' }
}
