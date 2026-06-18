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
  'rounded-xl border-[0.25px] border-ens-quartz-300 bg-white shadow-[0_2px_6px_rgba(0,0,0,0.06)] transition hover:bg-ens-quartz-50'

const cardLabelClassName = 'truncate text-ens-quartz-500 text-xs leading-normal'
const cardValueClassName = 'truncate text-ens-quartz-700 text-sm leading-normal'
const trailingIconClassName = 'size-5 shrink-0 text-ens-quartz-400'

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
      'px-5 py-6 md:px-8 md:pt-8 md:pb-6',
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
      <IconRenderer className="size-7 text-ens-quartz-900" icon={item.icon} />
      <div className="mt-auto min-w-0 pt-4">
        <p className={cardLabelClassName}>{item.label}</p>
        <p className={cardValueClassName}>
          {item.displayPrefix}
          {item.displayValue}
        </p>
      </div>
    </>
  )

  const className = `${cardSurfaceClassName} relative flex min-h-33.5 w-full flex-col p-6 text-left`

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
          className={`absolute top-6 right-6 ${trailingIconClassName}`}
        />
      </a>
    )
  }

  return (
    <CopyableButton
      className={`${className} h-auto items-start`}
      iconClassName={`absolute top-6 right-6 ${trailingIconClassName}`}
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
      <div className="grid gap-4 md:grid-cols-3 md:gap-6">
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
    className={`truncate font-mono text-[13px] tracking-[0.91px] ${className}`}
  >
    {truncateAddress(value)}
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
    <div className="flex shrink-0 items-center gap-1">
      {withIcon.map((chain) => (
        <IconRenderer
          className="size-6 object-contain"
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
    className={`${cardSurfaceClassName} h-auto w-full justify-between gap-4 px-6 py-5 md:max-w-132.75`}
    iconClassName={trailingIconClassName}
    value={address.value}
  >
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex min-w-0 items-center gap-2">
        <div className="size-6 shrink-0 overflow-hidden rounded-[4px] bg-ens-quartz-100">
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
        <span className="truncate font-semi-mono text-ens-quartz-900 text-sm">
          {name}
        </span>
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
    className={`${cardSurfaceClassName} h-auto min-h-18.5 w-full justify-between gap-3 px-6 py-5`}
    iconClassName={trailingIconClassName}
    value={address.value}
  >
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex size-10 shrink-0 items-center justify-center">
        <IconRenderer className="size-7 object-contain" icon={address.icon} />
      </div>
      <AddressValue className="text-ens-quartz-400" value={address.value} />
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
      <div className="space-y-8">
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
            <div className="grid gap-4 md:grid-cols-3 md:gap-6">
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
      <div className="flex size-9 shrink-0 items-center justify-center text-ens-quartz-900">
        <IconRenderer className="size-5" icon={recordDef?.icon} />
      </div>
      <div className="min-w-0 flex-1">
        <p className={cardLabelClassName}>{recordDef?.name ?? record.key}</p>
        <p className={cardValueClassName}>
          {recordDef?.displayPrefix}
          {displayValue}
        </p>
      </div>
    </>
  )
  const className = `${cardSurfaceClassName} flex min-h-22.75 w-full items-center gap-3 p-6 text-left`

  if (href) {
    return (
      <a
        className={className}
        href={href}
        rel="noopener noreferrer"
        target="_blank"
      >
        {content}
        <ArrowUpRight className={trailingIconClassName} />
      </a>
    )
  }

  return (
    <CopyableButton
      className={`${className} h-auto justify-start`}
      iconClassName={trailingIconClassName}
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
      <div className="grid gap-4 md:grid-cols-3 md:gap-6">
        {socialRecords.map((record) => (
          <SocialCard key={`${record.key}-${record.value}`} record={record} />
        ))}
      </div>
    </ProfileCard>
  )
}

const LinkPreview = ({ link }: { readonly link: SafeProfileLink }) => (
  <a
    className="group hover:-translate-y-0.5 flex min-h-51.25 min-w-0 flex-col overflow-hidden rounded-xl border-[#C7C6C4] border-[0.25px] bg-white shadow-none transition hover:shadow-[0_8px_18px_rgba(0,0,0,0.08)]"
    href={link.href}
    rel="noopener noreferrer"
    target="_blank"
    title={link.href}
  >
    <div className="flex h-30 items-center justify-center bg-(--theme-bg)">
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
    <ProfileCard className="md:px-12" title={<Trans>Links</Trans>}>
      <div className="grid gap-4 md:grid-cols-[repeat(3,minmax(0,230px))] md:gap-6">
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
