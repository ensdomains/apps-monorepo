import { match, P } from 'ts-pattern'
import { Badge } from '@/components/ui/badge'
import { GraceBadge } from '@/features/profile/components/GraceBadge'
import {
  getNameStatus,
  type NameStatusInput,
} from '@/features/renew/utils/nameExtension'
import { formatDateTime } from '@/utils/formatting/formatDateTime'
import { getEarlierParentExpiry } from '@/utils/names/addressNames'
import { dateToPlainDate } from '@/utils/temporal'

/** A name's expiry date, its parent's for a subname that lapses with it, noting a parent that expires first. */
export const NameExpiry = (props: NameStatusInput) =>
  match(props)
    .with({ expiryDate: P.instanceOf(Date) }, ({ expiryDate }) => {
      const parentExpiryDate = getEarlierParentExpiry(props)
      return (
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span>{formatDateTime(dateToPlainDate(expiryDate))}</span>
            {getNameStatus(props) === 'grace' && <GraceBadge />}
          </div>
          {parentExpiryDate && (
            <span className="text-small text-muted-foreground">
              Stops resolving with its parent on{' '}
              {formatDateTime(dateToPlainDate(parentExpiryDate))}
            </span>
          )}
        </div>
      )
    })
    .with({ parentExpiryDate: P.instanceOf(Date) }, ({ parentExpiryDate }) => (
      <span className="whitespace-nowrap">
        {formatDateTime(dateToPlainDate(parentExpiryDate))} (Expires with
        parent)
      </span>
    ))
    .with({ parentExpiryDate: null }, () => <span>Expires with parent</span>)
    .otherwise(() => (
      <Badge variant="secondary" className="text-small">
        Does not expire
      </Badge>
    ))
