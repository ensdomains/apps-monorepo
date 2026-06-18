import { Trans } from '@lingui/react/macro'
import { ArrowUpRight, ExternalLink, Link as LinkIcon } from 'lucide-react'
import { CopyableButton } from '@/components/atoms/CopyableButton'
import * as ImageFallback from '@/components/atoms/ImageFallback'
import { PatternAvatar } from '@/components/atoms/PatternAvatar/PatternAvatar'
import { IconRenderer } from '@/features/profile/components/IconRenderer'
import {
  getRecordDef,
  getRecordDisplayValue,
  getRecordHref,
} from '@/features/profile/data/records'
import type { ProfileRecords, TextRecordValue } from '@/features/profile/types'
import { cn, truncateAddress } from '@/lib/utils'
import {
  formatChainSpecificAddress,
  getChainSpecificAddresses,
  getMainReceivingAddress,
  getPrimaryContactItems,
  getReceivingAddressChains,
  getSafeProfileLinks,
  type ProfileAddressItem,
  type ProfileContactItem,
  type SafeProfileLink,
} from './ProfileViewNew.helpers'

type ProfileViewNewCardsProps = {
  readonly avatarUrl?: string
  readonly name: string
  readonly records: ProfileRecords
}

const profileCardClassName =
  'border-[0.25px] border-transparent bg-transparent shadow-none'

const sectionTitleClassName =
  'font-sans text-base text-ens-quartz-900 leading-normal'

const valueClassName = 'font-mono text-sm text-ens-quartz-500 leading-normal'

// White surface shared by every contact/social/address card in the design.
const cardSurfaceClassName =
  'rounded-[14px] border-[0.692px] border-[rgba(199,198,196,0.25)] bg-white shadow-[0_2px_6px_rgba(0,0,0,0.06)] transition hover:bg-ens-quartz-50 lg:landscape:rounded-xl lg:landscape:border-[0.25px] lg:landscape:border-ens-quartz-300'

const contactCardSurfaceClassName =
  'rounded-xl border-[0.25px] border-ens-quartz-300 bg-white shadow-[0_2px_6px_rgba(0,0,0,0.06)] transition hover:bg-ens-quartz-50'

const contactLabelClassName =
  'w-full truncate text-ens-quartz-500 text-[11px] leading-[16.5px] tracking-[-0.121px] lg:landscape:text-xs lg:landscape:leading-[18px] lg:landscape:tracking-[-0.132px]'
const contactValueClassName =
  'w-full truncate text-ens-quartz-500 text-[13px] leading-[19.5px] tracking-[-0.143px] lg:landscape:text-sm lg:landscape:text-ens-quartz-700 lg:landscape:leading-normal lg:landscape:tracking-[-0.154px]'
const contactTrailingIconClassName =
  'absolute top-4 right-4 ml-0 size-6 shrink-0 text-ens-quartz-400 lg:landscape:top-[24.25px] lg:landscape:right-[24.25px] lg:landscape:size-7.5 lg:landscape:text-ens-quartz-700'
const profileCardCopyIconClassName =
  'ml-0 size-4 shrink-0 text-ens-quartz-400 lg:landscape:size-6 lg:landscape:text-ens-quartz-700'
const profileCardTrailingIconStrokeWidth = 1.33
const contactCopyIconClassName = cn(
  profileCardCopyIconClassName,
  'absolute top-4 right-4 lg:landscape:top-[24.25px] lg:landscape:right-[24.25px]',
)
const contactCardPaddingClassName =
  'p-4 has-[>svg]:px-4 lg:landscape:p-[24.25px] lg:landscape:has-[>svg]:px-[24.25px]'
const addressCardPaddingClassName =
  'has-[>svg]:px-4 lg:landscape:p-[24.25px] lg:landscape:has-[>svg]:px-[24.25px]'
const socialLabelClassName =
  'truncate text-ens-quartz-500 text-xs leading-[16.5px] lg:landscape:leading-[18px]'
const socialValueClassName =
  'truncate text-ens-quartz-700 text-[12px] leading-[19.5px] lg:landscape:text-sm lg:landscape:leading-6'
const socialTrailingIconClassName =
  'size-[18px] shrink-0 text-ens-quartz-400 lg:landscape:size-7.5 lg:landscape:text-ens-quartz-700'
const socialCardPaddingClassName =
  'p-3 has-[>svg]:px-3 lg:landscape:p-[24.25px] lg:landscape:has-[>svg]:px-[24.25px]'

const ProfileCard = ({
  children,
  className = '',
  title,
}: {
  readonly children: React.ReactNode
  readonly className?: string
  readonly title: React.ReactNode
}) => (
  <section
    className={cn(
      profileCardClassName,
      'px-5 py-6 lg:landscape:px-8 lg:landscape:pt-8 lg:landscape:pb-6',
      className,
    )}
  >
    <h2 className={sectionTitleClassName}>{title}</h2>
    <div className="mt-6">{children}</div>
  </section>
)

const ContactCard = ({ item }: { readonly item: ProfileContactItem }) => {
  const content = (
    <>
      <div className="flex w-full min-w-0 flex-col items-start gap-2">
        <div className="flex w-full items-center justify-between">
          <IconRenderer
            className="size-7 text-ens-quartz-900 lg:landscape:size-7.5"
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

  const className = `${contactCardSurfaceClassName} ${contactCardPaddingClassName} relative flex min-h-28 w-full flex-col items-start gap-2 text-left lg:landscape:min-h-33.5`

  if (item.href) {
    return (
      <a
        className={className}
        href={item.href}
        rel="noopener noreferrer"
        target="_blank"
      >
        {content}
        <ArrowUpRight
          className={contactTrailingIconClassName}
          strokeWidth={1.33}
        />
      </a>
    )
  }

  return (
    <CopyableButton
      className={`${className} h-auto items-start`}
      iconClassName={contactCopyIconClassName}
      iconStrokeWidth={profileCardTrailingIconStrokeWidth}
      value={item.displayValue}
    >
      {content}
    </CopyableButton>
  )
}

const ProfileContactSection = ({
  records,
}: {
  readonly records: ProfileRecords
}) => {
  const contacts = getPrimaryContactItems(records)
  if (contacts.length === 0) return null

  return (
    <ProfileCard title={<Trans>Contact</Trans>}>
      <div className="grid grid-cols-2 gap-3 lg:landscape:grid-cols-3 lg:landscape:gap-6">
        {contacts.map((item) => (
          <ContactCard item={item} key={item.key} />
        ))}
      </div>
    </ProfileCard>
  )
}

const AddressValue = ({
  className = '',
  value,
}: {
  readonly className?: string
  readonly value: string
}) => (
  <span
    className={`truncate font-mono text-[12px] tracking-[0.84px] lg:landscape:text-[13px] lg:landscape:tracking-[0.91px] ${className}`}
  >
    {truncateAddress(value)}
  </span>
)

const ChainAddressValue = ({ value }: { readonly value: string }) => (
  <span
    className="w-[79px] whitespace-nowrap text-[13px] text-ens-quartz-400 leading-[1.2] tracking-[-0.26px] lg:landscape:w-[85px] lg:landscape:text-sm lg:landscape:leading-[1.1] lg:landscape:tracking-[-0.28px]"
    title={value}
  >
    {formatChainSpecificAddress(value)}
  </span>
)

const ReceivingChainIcons = ({
  chains,
}: {
  readonly chains: ProfileAddressItem[]
}) => {
  const withIcon = chains.filter((chain) => chain.icon)
  if (withIcon.length === 0) return null

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1 lg:landscape:min-w-50">
      {withIcon.map((chain) => (
        <IconRenderer
          className="size-4.5 object-contain lg:landscape:size-6.5"
          icon={chain.icon}
          key={`${chain.coinType}-${chain.value}`}
        />
      ))}
    </div>
  )
}

const MainAddressCard = ({
  address,
  avatarUrl,
  chains,
  name,
}: {
  readonly address: ProfileAddressItem
  readonly avatarUrl?: string
  readonly chains: ProfileAddressItem[]
  readonly name: string
}) => (
  <CopyableButton
    className={`${cardSurfaceClassName} ${addressCardPaddingClassName} h-[55px] w-full justify-between gap-2 py-0 lg:landscape:h-auto lg:landscape:max-w-132.75`}
    iconClassName={profileCardCopyIconClassName}
    iconStrokeWidth={profileCardTrailingIconStrokeWidth}
    value={address.value}
  >
    <div className="flex min-w-0 flex-1 items-center gap-2 lg:landscape:flex-wrap">
      <div className="flex min-w-0 items-center gap-2 lg:landscape:h-6.5 lg:landscape:gap-4">
        <div className="flex min-w-0 items-center gap-1">
          <div className="size-5.5 shrink-0 overflow-hidden rounded-full bg-ens-quartz-100 lg:landscape:size-[25.576px] lg:landscape:rounded-[4px]">
            <ImageFallback.Root className="contents">
              <ImageFallback.Image
                alt={`${name} avatar`}
                className="size-full object-cover"
                src={avatarUrl}
              />
              <ImageFallback.Fallback>
                <PatternAvatar
                  className="size-full rounded-[4px] border-none bg-transparent p-0 shadow-none"
                  name={name}
                />
              </ImageFallback.Fallback>
            </ImageFallback.Root>
          </div>
          <span className="truncate font-semi-mono text-[13px] text-ens-quartz-900 lg:landscape:text-sm lg:landscape:leading-[0.96] lg:landscape:tracking-[-0.28px]">
            {name}
          </span>
        </div>
        <AddressValue className="text-ens-quartz-900" value={address.value} />
      </div>
      <ReceivingChainIcons chains={chains} />
    </div>
  </CopyableButton>
)

const ChainAddressCard = ({
  address,
}: {
  readonly address: ProfileAddressItem
}) => (
  <CopyableButton
    className={cn(
      cardSurfaceClassName,
      addressCardPaddingClassName,
      'h-[65px] w-full justify-between gap-1 px-3 py-0 has-[>svg]:px-3 lg:landscape:h-auto lg:landscape:min-h-[88.5px] lg:landscape:gap-2 lg:landscape:px-[24.25px] lg:landscape:has-[>svg]:px-[24.25px]',
    )}
    iconClassName={profileCardCopyIconClassName}
    iconStrokeWidth={profileCardTrailingIconStrokeWidth}
    value={address.value}
  >
    <div className="flex min-w-0 items-center gap-1 lg:landscape:gap-0">
      <div className="flex size-7 shrink-0 items-center justify-center lg:landscape:size-10 lg:landscape:p-2">
        <IconRenderer
          className="size-6 object-contain lg:landscape:size-7"
          icon={address.icon}
        />
      </div>
      <ChainAddressValue value={address.value} />
    </div>
  </CopyableButton>
)

const ProfileAddressesSection = ({
  avatarUrl,
  name,
  records,
}: ProfileViewNewCardsProps) => {
  const mainAddress = getMainReceivingAddress(records)
  const receivingChains = getReceivingAddressChains(records)
  const chainAddresses = getChainSpecificAddresses(records)

  if (!mainAddress && chainAddresses.length === 0) return null

  return (
    <ProfileCard title={<Trans>Addresses</Trans>}>
      <div className="space-y-6">
        {mainAddress ? (
          <div>
            <h3 className="mb-3 text-ens-quartz-600 text-sm leading-normal">
              <Trans>Main receiving address</Trans>
            </h3>
            <MainAddressCard
              address={mainAddress}
              avatarUrl={avatarUrl}
              chains={receivingChains}
              name={name}
            />
          </div>
        ) : null}
        {chainAddresses.length > 0 ? (
          <div>
            <h3 className="mb-3 text-ens-quartz-600 text-sm leading-normal">
              <Trans>Chain specific addresses</Trans>
            </h3>
            <div className="grid grid-cols-1 gap-3 min-[375px]:grid-cols-2 lg:landscape:grid-cols-3 lg:landscape:gap-6">
              {chainAddresses.map((address) => (
                <ChainAddressCard
                  address={address}
                  key={`${address.coinType}-${address.value}`}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </ProfileCard>
  )
}

const SocialCard = ({ record }: { readonly record: TextRecordValue }) => {
  const recordDef = getRecordDef(record.key)
  const displayValue = getRecordDisplayValue(recordDef, record.value)
  const href = getRecordHref(recordDef, displayValue)
  const content = (
    <>
      <div className="flex size-5.25 shrink-0 items-center justify-center text-ens-quartz-900 lg:landscape:size-9 lg:landscape:rounded-[10px] lg:landscape:bg-white">
        <IconRenderer
          className="size-4 lg:landscape:size-5"
          icon={recordDef?.icon}
        />
      </div>
      <div className="min-w-0 flex-1 lg:landscape:h-[42px]">
        <p className={socialLabelClassName}>{recordDef?.name ?? record.key}</p>
        <p className={socialValueClassName}>
          {recordDef?.displayPrefix}
          {displayValue}
        </p>
      </div>
    </>
  )
  const className = `${cardSurfaceClassName} ${socialCardPaddingClassName} flex min-h-17 w-full items-center gap-1 font-sans text-left lg:landscape:min-h-22.75 lg:landscape:gap-2`

  if (href) {
    return (
      <a
        className={className}
        href={href}
        rel="noopener noreferrer"
        target="_blank"
      >
        {content}
        <ArrowUpRight
          className={socialTrailingIconClassName}
          strokeWidth={1.33}
        />
      </a>
    )
  }

  return (
    <CopyableButton
      className={`${className} h-auto justify-start`}
      iconClassName={profileCardCopyIconClassName}
      iconStrokeWidth={profileCardTrailingIconStrokeWidth}
      value={displayValue}
    >
      {content}
    </CopyableButton>
  )
}

const ProfileSocialSection = ({
  records,
}: {
  readonly records: ProfileRecords
}) => {
  const socialRecords = records.social.filter((record) => record.value.trim())
  if (socialRecords.length === 0) return null

  return (
    <ProfileCard title={<Trans>Social</Trans>}>
      <div className="grid grid-cols-2 gap-3 lg:landscape:grid-cols-3 lg:landscape:gap-6">
        {socialRecords.map((record) => (
          <SocialCard key={`${record.key}-${record.value}`} record={record} />
        ))}
      </div>
    </ProfileCard>
  )
}

const LinkPreview = ({ link }: { readonly link: SafeProfileLink }) => (
  <a
    className="group flex h-[205px] min-w-0 flex-col overflow-hidden rounded-[14px] border-[0.692px] border-[rgba(199,198,196,0.25)] bg-white shadow-[0_2px_6px_rgba(0,0,0,0.06)] transition hover:bg-ens-quartz-50 lg:landscape:rounded-xl lg:landscape:border-[#C7C6C4] lg:landscape:border-[0.25px]"
    href={link.href}
    rel="noopener noreferrer"
    target="_blank"
    title={link.href}
  >
    <div className="flex h-30 shrink-0 items-center justify-center bg-(--theme-bg)">
      <div className="flex size-14 items-center justify-center rounded-xl bg-white/80 text-(--theme-color) shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
        <LinkIcon className="size-6" strokeWidth={1.8} />
      </div>
    </div>
    <div className="min-w-0 px-6 py-5">
      <div className="truncate text-ens-quartz-900 text-sm leading-normal">
        {link.name}
      </div>
      <div className="mt-1 flex min-w-0 items-center gap-1 text-ens-quartz-500">
        <span className={`${valueClassName} truncate`}>{link.displayHost}</span>
        <ExternalLink className="group-hover:-translate-y-0.5 size-4 shrink-0 transition group-hover:translate-x-0.5" />
      </div>
    </div>
  </a>
)

const ProfileLinksSection = ({
  records,
}: {
  readonly records: ProfileRecords
}) => {
  const links = getSafeProfileLinks(records)
  if (links.length === 0) return null

  return (
    <ProfileCard title={<Trans>Links</Trans>}>
      <div className="grid gap-4 lg:landscape:grid-cols-3 lg:landscape:gap-6">
        {links.map((link) => (
          <LinkPreview key={`${link.name}-${link.href}`} link={link} />
        ))}
      </div>
    </ProfileCard>
  )
}

export const ProfileViewNewCards = ({
  avatarUrl,
  name,
  records,
}: ProfileViewNewCardsProps) => (
  <div className="space-y-0">
    <ProfileContactSection records={records} />
    <ProfileAddressesSection
      avatarUrl={avatarUrl}
      name={name}
      records={records}
    />
    <ProfileSocialSection records={records} />
    <ProfileLinksSection records={records} />
  </div>
)
