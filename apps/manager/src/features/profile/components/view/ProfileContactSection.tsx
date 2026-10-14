import { Trans } from '@lingui/react/macro'
import { ArrowUpRight } from 'lucide-react'
import { CopyableButton } from '@/components/atoms/CopyableButton'
import { Card } from '@/components/ui/card'
import { IconRenderer } from '@/features/profile/components/IconRenderer'
import type { ProfileRecords } from '@/features/profile/types'
import { cn } from '@/lib/utils'
import {
  ProfileCard,
  profileCardCopyIconClassName,
  profileCardTrailingIconStrokeWidth,
} from './ProfileCard'
import { getContactItems, type ProfileContactItem } from './ProfileView.helpers'

const contactCardSurfaceClassName = 'transition hover:bg-ens-quartz-50'
const contactLabelClassName =
  'w-full truncate text-ens-quartz-500 text-[11px] leading-[16.5px] tracking-[-0.121px] profile-desktop:text-xs profile-desktop:leading-4.5 profile-desktop:tracking-[-0.132px]'
const contactValueClassName =
  'w-full truncate text-ens-quartz-500 text-[13px] leading-[19.5px] tracking-[-0.143px] profile-desktop:text-sm profile-desktop:text-ens-quartz-700 profile-desktop:leading-normal profile-desktop:tracking-[-0.154px]'
const contactTrailingIconClassName =
  'absolute top-4 right-4 ml-0 size-6 shrink-0 text-ens-quartz-400 profile-desktop:top-[24.25px] profile-desktop:right-[24.25px] profile-desktop:size-7.5 profile-desktop:text-ens-quartz-700'
const contactCopyIconClassName = cn(
  profileCardCopyIconClassName,
  'absolute profile-desktop:top-[24.25px] top-4 profile-desktop:right-[24.25px] right-4',
)
const contactCardPaddingClassName =
  'p-4 has-[>svg]:px-4 profile-desktop:p-[24.25px] profile-desktop:has-[>svg]:px-[24.25px]'

export const ProfileContactCard = ({
  item,
}: {
  readonly item: ProfileContactItem
}) => {
  const content = (
    <>
      <div className="flex w-full min-w-0 flex-col items-start gap-2">
        <div className="flex w-full items-center justify-between">
          <IconRenderer
            className="profile-desktop:size-7.5 size-7 text-ens-quartz-900"
            icon={item.icon}
          />
        </div>
        <p className={contactLabelClassName}>{item.label}</p>
      </div>
      <p className={contactValueClassName}>
        {item.displayPrefix}
        {item.displayValue}
      </p>
    </>
  )

  const className = `${contactCardSurfaceClassName} ${contactCardPaddingClassName} relative flex min-h-28 w-full flex-col items-start gap-2 text-left profile-desktop:min-h-33.5`

  if (item.href) {
    return (
      <Card asChild className={className}>
        <a href={item.href} rel="noopener noreferrer" target="_blank">
          {content}
          <ArrowUpRight
            className={contactTrailingIconClassName}
            strokeWidth={1.33}
          />
        </a>
      </Card>
    )
  }

  return (
    <Card asChild className={`${className} h-auto items-start`}>
      <CopyableButton
        iconClassName={contactCopyIconClassName}
        iconStrokeWidth={profileCardTrailingIconStrokeWidth}
        value={item.displayValue}
        variant="ghost"
      >
        {content}
      </CopyableButton>
    </Card>
  )
}

export const ProfileContactSection = ({
  records,
}: {
  readonly records: ProfileRecords
}) => {
  const contacts = getContactItems(records)
  if (contacts.length === 0) return null

  return (
    <ProfileCard title={<Trans>Contact</Trans>}>
      <div className="grid grid-cols-2 profile-desktop:grid-cols-3 gap-3 profile-desktop:gap-6">
        {contacts.map((item) => (
          <ProfileContactCard item={item} key={item.key} />
        ))}
      </div>
    </ProfileCard>
  )
}
