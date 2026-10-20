import { Trans } from '@lingui/react/macro'
import { ArrowUpRight } from 'lucide-react'
import { CopyableButton } from '@/components/atoms/CopyableButton'
import { Card } from '@/components/ui/card'
import { IconRenderer } from '@/features/profile/components/IconRenderer'
import {
  getRecordDef,
  getRecordDisplayValue,
  getRecordHref,
} from '@/features/profile/data/records'
import type { ProfileRecords, TextRecordValue } from '@/features/profile/types'
import {
  ProfileCard,
  profileCardCopyIconClassName,
  profileCardTrailingIconStrokeWidth,
  profileTileClassName,
} from './ProfileCard'
import { getSecondarySocialRecords } from './ProfileView.helpers'

const socialLabelClassName =
  'truncate text-ens-quartz-500 text-xs leading-[16.5px] xl:leading-4.5'
const socialValueClassName =
  'truncate text-ens-quartz-700 text-[12px] leading-[19.5px] xl:text-sm xl:leading-6'
const socialTrailingIconClassName =
  'size-[18px] shrink-0 text-ens-quartz-400 xl:size-7.5 xl:text-ens-quartz-700'
const socialCardPaddingClassName =
  'p-3 has-[>svg]:px-3 xl:p-[24.25px] xl:has-[>svg]:px-[24.25px]'

const SocialCard = ({ record }: { readonly record: TextRecordValue }) => {
  const recordDef = getRecordDef(record.key)
  const displayValue = getRecordDisplayValue(recordDef, record.value)
  const href = getRecordHref(recordDef, displayValue)
  const content = (
    <>
      <div className="flex size-5.25 shrink-0 items-center justify-center text-ens-quartz-900 xl:size-9 xl:rounded-[10px] xl:bg-white">
        <IconRenderer className="size-4 xl:size-5" icon={recordDef?.icon} />
      </div>
      <div className="min-w-0 flex-1 xl:h-10.5">
        <p className={socialLabelClassName}>{recordDef?.name ?? record.key}</p>
        <p className={socialValueClassName}>
          {recordDef?.displayPrefix}
          {displayValue}
        </p>
      </div>
    </>
  )
  const className = `${profileTileClassName} flex-row transition hover:bg-ens-quartz-50 ${socialCardPaddingClassName} min-h-17 w-full items-center gap-1 font-sans text-left xl:min-h-22.75 xl:gap-2`

  if (href) {
    return (
      <Card asChild className={className}>
        <a href={href} rel="noopener noreferrer" target="_blank">
          {content}
          <ArrowUpRight
            className={socialTrailingIconClassName}
            strokeWidth={1.33}
          />
        </a>
      </Card>
    )
  }

  return (
    <Card asChild className={`${className} h-auto justify-start`}>
      <CopyableButton
        iconClassName={profileCardCopyIconClassName}
        iconStrokeWidth={profileCardTrailingIconStrokeWidth}
        value={displayValue}
        variant="ghost"
      >
        {content}
      </CopyableButton>
    </Card>
  )
}

export const ProfileSocialSection = ({
  records,
}: {
  readonly records: ProfileRecords
}) => {
  const socialRecords = getSecondarySocialRecords(records)
  if (socialRecords.length === 0) return null

  return (
    <ProfileCard title={<Trans>Social</Trans>}>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3 xl:gap-6">
        {socialRecords.map((record) => (
          <SocialCard key={`${record.key}-${record.value}`} record={record} />
        ))}
      </div>
    </ProfileCard>
  )
}
