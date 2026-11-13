import { match, P } from 'ts-pattern'
import { Badge } from '@/components/ui/badge'
import { GraceBadge } from '@/features/profile/components/GraceBadge'
import {
  getNameStatus,
  MS_PER_SECOND,
  type NameStatusInput,
} from '@/features/renew/utils/nameExtension'
import { formatDateTime } from '@/utils/formatting/formatDateTime'
import { getEarlierParentExpiry } from '@/utils/names/addressNames'
import { unixSecondsToPlainDateUtc } from '@/utils/temporal'

/** The expiry's UTC day, so every viewer sees the contract's date. */
const formatExpiry = (date: Date) =>
  formatDateTime(
    unixSecondsToPlainDateUtc(Math.floor(date.getTime() / MS_PER_SECOND)),
  )

/** A name's expiry date, its parent's for a subname that lapses with it, noting a parent that expires first. */
export const NameExpiry = (props: NameStatusInput) =>
  match(props)
    .with({ expiryDate: P.instanceOf(Date) }, ({ expiryDate }) => {
      const parentExpiryDate = getEarlierParentExpiry(props)
      return (
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span>{formatExpiry(expiryDate)}</span>
            {getNameStatus(props) === 'grace' && <GraceBadge />}
          </div>
          {parentExpiryDate && (
            <span className="text-small text-muted-foreground">
              Stops resolving with its parent on{' '}
              {formatExpiry(parentExpiryDate)}
            </span>
          )}
        </div>
      )
    })
    .with({ parentExpiryDate: P.instanceOf(Date) }, ({ parentExpiryDate }) => (
      <span className="whitespace-nowrap">
        {formatExpiry(parentExpiryDate)} (Expires with parent)
      </span>
    ))
    .with({ parentExpiryDate: null }, () => <span>Expires with parent</span>)
    .otherwise(() => (
      <Badge variant="secondary" className="text-small">
        Does not expire
      </Badge>
    ))
