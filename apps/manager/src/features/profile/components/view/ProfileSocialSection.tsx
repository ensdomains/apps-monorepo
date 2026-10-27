import { Trans } from '@lingui/react/macro'
import { CopyableButton } from '@/components/atoms/CopyableButton'
import { Card } from '@/components/ui/card'
import { MSymbol } from '@/components/ui/material-symbol'
import { IconRenderer } from '@/features/profile/components/IconRenderer'
import {
  getRecordDef,
  getRecordDisplayValue,
  getRecordHref,
} from '@/features/profile/data/records'
import type { ProfileRecords, TextRecordValue } from '@/features/profile/types'
import {
  ProfileCard,
  profileCardArrowClassName,
  profileCardCopyIconClassName,
  profileCardTrailingIconStrokeWidth,
  profileFieldLabelClassName,
  profileFieldValueClassName,
  profileTileClassName,
} from './ProfileCard'
import { getSecondarySocialRecords } from './ProfileView.helpers'

const socialLabelClassName = `truncate ${profileFieldLabelClassName}`
const socialValueClassName = `truncate ${profileFieldValueClassName}`
const socialTrailingIconClassName = profileCardArrowClassName
const socialCardPaddingClassName = 'p-6 has-[>svg]:px-6'

const SocialCard = ({ record }: { readonly record: TextRecordValue }) => {
  const recordDef = getRecordDef(record.key)
  const displayValue = getRecordDisplayValue(recordDef, record.value)
  const href = getRecordHref(recordDef, displayValue)
  const content = (
    <>
      <div className="flex size-6 shrink-0 items-center justify-center text-ens-quartz-900">
        <IconRenderer className="size-6" icon={recordDef?.icon} />
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
  const className = `${profileTileClassName} flex-row transition hover:bg-ens-quartz-50 ${socialCardPaddingClassName} min-h-17 w-full items-center gap-2 font-sans text-left xl:min-h-22.75 xl:gap-3`

  if (href) {
    return (
      <Card asChild className={className}>
        <a href={href} rel="noopener noreferrer" target="_blank">
          {content}
          <MSymbol
            className={socialTrailingIconClassName}
            symbol="arrow_outward"
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
