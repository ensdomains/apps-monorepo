import { Badge } from '@/components/ui/badge'
import { GraceBadge } from '@/features/profile/components/GraceBadge'
import {
  getNameStatus,
  type NameStatusInput,
} from '@/features/renew/utils/nameExtension'
import { formatDateTime } from '@/utils/formatting/formatDateTime'
import { dateToPlainDate } from '@/utils/temporal'

/** A name's expiry date, its parent's for a subname that lapses with it. */
export const NameExpiry = (props: NameStatusInput) => {
  const { expiryDate, parentExpiryDate } = props

  if (expiryDate)
    return (
      <div className="flex items-center gap-2">
        <span>{formatDateTime(dateToPlainDate(expiryDate))}</span>
        {getNameStatus(props) === 'grace' && <GraceBadge />}
      </div>
    )

  if (parentExpiryDate)
    return (
      <span className="whitespace-nowrap">
        {formatDateTime(dateToPlainDate(parentExpiryDate))} (Expires with
        parent)
      </span>
    )

  return (
    <Badge variant="secondary" className="text-small">
      Does not expire
    </Badge>
  )
}
