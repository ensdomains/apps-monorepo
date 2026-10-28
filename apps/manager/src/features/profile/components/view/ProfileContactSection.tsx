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
  'ms-opsz-32 ms-wght-280 text-[32px] text-ens-quartz-900 leading-none tracking-[0.4px] [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]'

const contactCardSurfaceClassName = cn(
  profileTileClassName,
  'transition hover:bg-ens-quartz-50',
)
const contactLabelClassName =
  'h-[16.5px] w-full truncate font-sans font-normal text-[11px] text-ens-quartz-500 leading-[16.5px] tracking-[-0.121px] xl:h-[18px] xl:text-xs xl:leading-[18px] xl:tracking-[-0.132px]'
const contactValueClassName =
  'h-[19.5px] w-full truncate font-sans font-normal text-[13px] text-ens-quartz-500 leading-[19.5px] tracking-[-0.143px] xl:h-[21px] xl:text-sm xl:text-ens-quartz-700 xl:leading-[21px] xl:tracking-[-0.154px]'
const contactTrailingIconClassName = cn(
  profileCardArrowClassName,
  'absolute top-6 right-6',
)
const contactCopyIconClassName = (wide: boolean) =>
  cn(
    profileCardCopyIconClassName,
    'absolute top-6 right-6',
    wide && 'max-xl:static max-xl:top-auto max-xl:right-auto',
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
        <div className="flex min-w-0 flex-col">
          <p className={contactLabelClassName}>{item.label}</p>
          {wide ? <div className="xl:hidden">{value}</div> : null}
        </div>
      </div>
      {wide ? <div className="hidden w-full xl:block">{value}</div> : value}
    </>
  )

  // Stacked cards keep a 112px floor and stretch with the row. The full-width
  // mobile card hugs its icon and two text lines instead of that floor.
  const className = cn(
    contactCardSurfaceClassName,
    contactCardPaddingClassName,
    'relative flex w-full flex-col items-start gap-0 text-left font-sans xl:gap-2',
    'min-h-28 xl:min-h-33.5',
    wide &&
      'max-xl:h-auto max-xl:min-h-0 max-xl:flex-row max-xl:items-center max-xl:justify-between',
  )

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
        iconClassName={contactCopyIconClassName(wide)}
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
