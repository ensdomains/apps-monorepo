import { match } from 'ts-pattern'
import { EntityBadge } from '@/components/EntityBadge'
import { Badge } from '@/components/ui/badge'
import { GraceBadge } from '@/features/profile/components/GraceBadge'
import {
  getNameStatus,
  MS_PER_SECOND,
  type NameStatusInput,
} from '@/features/renew/utils/nameExtension'
import { formatDateTime } from '@/utils/formatting/formatDateTime'
import {
  type AddressNameItem,
  getResolvingExpiry,
} from '@/utils/names/addressNames'
import { unixSecondsToPlainDateUtc } from '@/utils/temporal'

/** The expiry's UTC day, so every viewer sees the contract's date. */
export const formatExpiry = (date: Date) =>
  formatDateTime(
    unixSecondsToPlainDateUtc(Math.floor(date.getTime() / MS_PER_SECOND)),
  )

/** "· Expires with {name}" after a date a name above sets; the name links to it. */
export const ExpiresWith = ({ name }: { readonly name?: string }) => (
  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
    · Expires with{' '}
    {name ? (
      <EntityBadge variant="name" name={name} compact>
        {name}
      </EntityBadge>
    ) : (
      'parent'
    )}
  </span>
)

type NameExpiryProps = NameStatusInput &
  Pick<AddressNameItem, 'parentExpiryName'>

/** When a name stops resolving: its own expiry, or the first name above it to expire, named. */
export const NameExpiry = (props: NameExpiryProps) =>
  match(getResolvingExpiry(props))
    .with({ type: 'own' }, ({ date }) => (
      <div className="flex items-center gap-2">
        <span>{formatExpiry(date)}</span>
        {getNameStatus(props) === 'grace' && <GraceBadge />}
      </div>
    ))
    .with({ type: 'parent' }, ({ date, name }) => (
      <span className="flex flex-wrap items-center gap-x-1.5">
        <span className="whitespace-nowrap">{formatExpiry(date)}</span>{' '}
        <ExpiresWith name={name} />
      </span>
    ))
    .with({ type: 'unread' }, () => <span>Expires with parent</span>)
    .with({ type: 'none' }, () => (
      <Badge variant="secondary" className="text-small">
        Does not expire
      </Badge>
    ))
    .exhaustive()
