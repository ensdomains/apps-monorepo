import { Trans } from '@lingui/react/macro'
import { CopyableButton } from '@/components/atoms/CopyableButton'
import { Card } from '@/components/ui/card'
import { type MaterialSymbol, MSymbol } from '@/components/ui/material-symbol'
import { IconRenderer } from '@/features/profile/components/IconRenderer'
import type { ProfileRecords } from '@/features/profile/types'
import { cn } from '@/lib/utils'
import {
  ProfileCard,
  profileCardArrowClassName,
  profileCardCopyIconClassName,
  profileCardTrailingIconStrokeWidth,
  profileRecordGridClassName,
  profileRecordGridItemClassName,
  profileTileClassName,
} from './ProfileCard'
import { getContactItems, type ProfileContactItem } from './ProfileView.helpers'

const contactMaterialIcon: Partial<Record<string, MaterialSymbol>> = {
  email: 'mail',
  mail: 'home',
  phone: 'phone',
}

const contactMaterialIconClassName =
  'ms-opsz-32 ms-wght-300 text-[32px] leading-none text-ens-quartz-900'

const contactCardSurfaceClassName = cn(
  profileTileClassName,
  'transition hover:bg-ens-quartz-50',
)
const contactLabelClassName =
  'w-full truncate font-sans text-ens-quartz-500 text-[11px] leading-[16.5px] tracking-[-0.121px] xl:text-xs xl:leading-4.5 xl:tracking-[-0.132px]'
const contactValueClassName =
  'w-full truncate font-sans text-ens-quartz-500 text-[13px] leading-[19.5px] tracking-[-0.143px] xl:text-sm xl:text-ens-quartz-700 xl:leading-normal xl:tracking-[-0.154px]'
const contactTrailingIconClassName = cn(
  profileCardArrowClassName,
  'absolute top-6 right-6',
)
const contactCopyIconClassName = cn(
  profileCardCopyIconClassName,
  'absolute top-6 right-6',
)
const contactCardPaddingClassName = 'p-6 has-[>svg]:px-6'

export const ProfileContactCard = ({
  item,
  wide = false,
}: {
  readonly item: ProfileContactItem
  readonly wide?: boolean
}) => {
  const materialIcon = contactMaterialIcon[item.key]
  const icon = materialIcon ? (
    <MSymbol className={contactMaterialIconClassName} symbol={materialIcon} />
  ) : (
    <IconRenderer className="size-6 text-ens-quartz-900" icon={item.icon} />
  )
  const value = (
    <p className={contactValueClassName}>
      {item.displayPrefix}
      {item.displayValue}
    </p>
  )
  const content = (
    <>
      <div
        className={cn(
          'flex w-full min-w-0 flex-col items-start gap-2',
          wide &&
            'max-xl:w-auto max-xl:flex-row max-xl:items-center max-xl:gap-3',
        )}
      >
        {icon}
        <div className="flex min-w-0 flex-col gap-2">
          <p className={contactLabelClassName}>{item.label}</p>
          {wide ? <div className="xl:hidden">{value}</div> : null}
        </div>
      </div>
      {wide ? <div className="hidden w-full xl:block">{value}</div> : value}
    </>
  )

  const className = `${contactCardSurfaceClassName} ${contactCardPaddingClassName} relative flex min-h-28 w-full flex-col items-start gap-2 font-sans text-left xl:min-h-33.5`

  if (item.href) {
    return (
      <Card asChild className={className}>
        <a href={item.href} rel="noopener noreferrer" target="_blank">
          {content}
          <MSymbol
            className={contactTrailingIconClassName}
            symbol="arrow_outward"
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
      <div className={profileRecordGridClassName}>
        {contacts.map((item, index) => (
          <div
            className={profileRecordGridItemClassName(index, contacts.length)}
            key={item.key}
          >
            <ProfileContactCard
              item={item}
              wide={index === contacts.length - 1 && contacts.length % 2 === 1}
            />
          </div>
        ))}
      </div>
    </ProfileCard>
  )
}
