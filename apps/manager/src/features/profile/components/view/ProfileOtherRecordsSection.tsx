import { Trans } from '@lingui/react/macro'
import { CopyableButton } from '@/components/atoms/CopyableButton'
import { Card } from '@/components/ui/card'
import type { ProfileRecords, TextRecordValue } from '@/features/profile/types'
import { cn } from '@/lib/utils'
import {
  ProfileCard,
  profileCardCopyIconClassName,
  profileFieldLabelClassName,
  profileFieldValueClassName,
  profileTileClassName,
} from './ProfileCard'
import { getOtherRecords } from './ProfileView.helpers'

const recordCardClassName = cn(
  profileTileClassName,
  'h-auto w-full min-w-0 flex-row items-start justify-between gap-3 p-6 text-left transition hover:bg-ens-quartz-50',
)
// Keys and values are free text, so they wrap anywhere and are clamped to stay card sized.
const recordKeyClassName = cn(
  profileFieldLabelClassName,
  'wrap-anywhere line-clamp-2 whitespace-normal',
)
const recordValueClassName = cn(
  profileFieldValueClassName,
  'wrap-anywhere line-clamp-3 whitespace-normal',
)

// The value is only ever rendered as text: a custom record is never turned into a link.
const OtherRecordCard = ({ record }: { readonly record: TextRecordValue }) => (
  <Card asChild className={recordCardClassName}>
    <CopyableButton
      iconClassName={profileCardCopyIconClassName}
      value={record.value}
      variant="ghost"
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={recordKeyClassName}>{record.key}</span>
        <span className={recordValueClassName}>{record.value}</span>
      </span>
    </CopyableButton>
  </Card>
)

export const ProfileOtherRecordsSection = ({
  records,
}: {
  readonly records: ProfileRecords
}) => {
  const otherRecords = getOtherRecords(records)
  if (otherRecords.length === 0) return null

  return (
    <ProfileCard title={<Trans>Other records</Trans>}>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 xl:gap-6">
        {otherRecords.map((record) => (
          <OtherRecordCard
            key={`${record.key}-${record.value}`}
            record={record}
          />
        ))}
      </div>
    </ProfileCard>
  )
}
