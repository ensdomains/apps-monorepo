import { Trans, useLingui } from '@lingui/react/macro'
import type { Address } from 'viem'
import * as ImageFallback from '@/components/atoms/ImageFallback'
import { PatternAvatar } from '@/components/atoms/PatternAvatar/PatternAvatar'
import { MSymbol } from '@/components/ui/material-symbol'
import type { ProfileRecords } from '@/features/profile/types'
import { useCopyFeedback } from '@/hooks/useCopyFeedback'
import { cn, truncateAddress } from '@/lib/utils'
import {
  formatProfileDetailDate,
  getSafeProfileHref,
} from './ProfileViewNew.helpers'

type ProfileViewNewHeaderProps = {
  readonly avatarUrl?: string
  readonly avatarLoading: boolean
  readonly displayExpiryDate?: Date | null
  readonly headerLoading: boolean
  readonly headerUrl?: string
  readonly name: string
  readonly owner?: Address
  readonly ownerReverseName?: string | null
  readonly records: ProfileRecords
  readonly registrationDate?: number | null
}

const detailLabelClassName =
  'flex items-center text-ens-quartz-400 text-base leading-[1.5]'
const detailValueClassName =
  'font-sans text-[13px] text-ens-quartz-700 leading-[1.5] tracking-[0.91px]'

const getContactRecordValue = (records: ProfileRecords, key: string) =>
  records.contact.find((record) => record.key === key)?.value?.trim()

const getDisplayHost = (href: string) => {
  try {
    return new URL(href).hostname.replace(/^www\./, '')
  } catch {
    return href
  }
}

const formatLanguage = (language: string | undefined) =>
  language
    ?.split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .join(', ')
    .toUpperCase()

const NameBadge = ({ name }: { readonly name: string }) => (
  <div className="inline-flex max-w-full items-center rounded-[3px] bg-(--theme-color) px-3 py-2 text-white">
    <h1 className="truncate font-semi-mono text-[32px] leading-[0.96]">
      {name}
    </h1>
  </div>
)

const ProfileDetail = ({
  icon,
  label,
  value,
  copyValue,
  iconGapClassName = 'gap-3',
}: {
  readonly icon: React.ReactNode
  readonly label: React.ReactNode
  readonly value: React.ReactNode
  readonly copyValue?: string
  readonly iconGapClassName?: string
}) => (
  <div className="flex min-w-0 items-center gap-1.5">
    <div className={cn(detailLabelClassName, iconGapClassName)}>
      {icon}
      <span>{label}</span>
    </div>
    <div className="flex min-w-0 items-center gap-1">
      <span className={`${detailValueClassName} truncate`}>{value}</span>
      {copyValue ? <ProfileDetailCopyButton value={copyValue} /> : null}
    </div>
  </div>
)

const ProfileDetailCopyButton = ({ value }: { readonly value: string }) => {
  const { t } = useLingui()
  const { copied, copy } = useCopyFeedback()

  return (
    <button
      aria-label={t`Copy to clipboard`}
      className="inline-flex size-5 shrink-0 items-center justify-center text-ens-quartz-400"
      onClick={() => copy(value)}
      title={t`Copy to clipboard`}
      type="button"
    >
      <MSymbol
        className="ms-opsz-20 ms-wght-300"
        symbol={copied ? 'check' : 'content_copy'}
      />
    </button>
  )
}

const ProfileDetails = ({
  displayExpiryDate,
  owner,
  ownerReverseName,
  registrationDate,
}: Pick<
  ProfileViewNewHeaderProps,
  'displayExpiryDate' | 'owner' | 'ownerReverseName' | 'registrationDate'
>) => {
  const formattedRegistrationDate = registrationDate
    ? formatProfileDetailDate(new Date(registrationDate * 1000))
    : undefined
  const formattedExpiryDate = formatProfileDetailDate(displayExpiryDate)

  return (
    <div className="flex max-w-full flex-wrap items-center gap-x-6 gap-y-3">
      {owner ? (
        <ProfileDetail
          copyValue={owner}
          icon={
            <MSymbol className="ms-opsz-20 ms-wght-300" symbol="key_vertical" />
          }
          iconGapClassName="gap-0.5"
          label={<Trans>Owner</Trans>}
          value={ownerReverseName || truncateAddress(owner)}
        />
      ) : null}
      {formattedRegistrationDate ? (
        <ProfileDetail
          icon={
            <MSymbol
              className="ms-opsz-20 ms-wght-300"
              symbol="calendar_clock"
            />
          }
          label={<Trans>Registered</Trans>}
          value={formattedRegistrationDate}
        />
      ) : null}
      {formattedExpiryDate ? (
        <ProfileDetail
          icon={<MSymbol className="ms-opsz-20 ms-wght-300" symbol="history" />}
          label={<Trans>Expires</Trans>}
          value={formattedExpiryDate}
        />
      ) : null}
    </div>
  )
}

const AboutMetaItem = ({
  icon,
  value,
}: {
  readonly icon: React.ReactNode
  readonly value: string | undefined
}) => {
  if (!value) return null

  return (
    <div className="flex min-w-0 items-center gap-1 text-ens-quartz-700">
      <span className="shrink-0 text-ens-quartz-700">{icon}</span>
      <span className="truncate text-sm leading-[1.5]">{value}</span>
    </div>
  )
}

const AboutCard = ({ records }: { readonly records: ProfileRecords }) => {
  const websiteHref = records.base.url
    ? getSafeProfileHref(records.base.url)
    : undefined
  const timezone = getContactRecordValue(records, 'timezone')
  const language = formatLanguage(records.base.language)
  const location = getContactRecordValue(records, 'location')?.toUpperCase()

  return (
    <section className="flex min-h-[182px] flex-1 rounded-xl border-[0.25px] border-ens-quartz-300 bg-white p-6 shadow-[0_2px_6px_rgba(0,0,0,0.06)] md:max-w-[635px]">
      <div className="grid w-full gap-6 md:grid-cols-[minmax(0,1fr)_228px]">
        <div className="min-w-0">
          <h2 className="text-base text-ens-quartz-700 leading-[1.5]">
            <Trans>About</Trans>
          </h2>
          {records.base.description ? (
            <p className="mt-3 text-ens-quartz-500 text-sm leading-[1.5]">
              {records.base.description}
            </p>
          ) : null}
          {websiteHref ? (
            <a
              className="mt-1 inline-flex max-w-full items-center gap-1 font-mono text-(--theme-color) text-sm leading-[1.5] hover:opacity-80"
              href={websiteHref}
              rel="noopener noreferrer"
              target="_blank"
            >
              <span className="truncate">{getDisplayHost(websiteHref)}</span>
              <MSymbol
                className="ms-opsz-20 ms-wght-300 shrink-0"
                symbol="arrow_outward"
              />
            </a>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-col justify-start gap-1.5">
          <AboutMetaItem
            icon={
              <MSymbol className="ms-opsz-24 ms-wght-300" symbol="language" />
            }
            value={timezone}
          />
          <AboutMetaItem
            icon={
              <MSymbol className="ms-opsz-24 ms-wght-300" symbol="translate" />
            }
            value={language}
          />
          <AboutMetaItem
            icon={
              <MSymbol className="ms-opsz-24 ms-wght-300" symbol="distance" />
            }
            value={location}
          />
        </div>
      </div>
    </section>
  )
}

const AvatarBlock = ({
  avatarLoading,
  avatarUrl,
  name,
}: Pick<ProfileViewNewHeaderProps, 'avatarLoading' | 'avatarUrl' | 'name'>) => (
  <div className="relative size-[148px] shrink-0 overflow-hidden rounded-xl bg-ens-quartz-100 shadow-[0_4px_16px_rgba(0,0,0,0.12)] md:size-[182px]">
    <ImageFallback.Root className="contents">
      <ImageFallback.Image
        alt={`${name} avatar`}
        className="size-full object-cover"
        src={avatarUrl}
      />
      <ImageFallback.Fallback>
        <PatternAvatar
          className="size-full rounded-xl border-none bg-transparent p-0 shadow-none"
          name={name}
        />
        {avatarLoading ? (
          <div className="absolute inset-0 animate-pulse rounded-xl bg-ens-quartz-100/70" />
        ) : null}
      </ImageFallback.Fallback>
    </ImageFallback.Root>
  </div>
)

export const ProfileViewNewBanner = ({
  headerLoading,
  headerUrl,
  name,
}: Pick<ProfileViewNewHeaderProps, 'headerLoading' | 'headerUrl' | 'name'>) => (
  <div className="relative h-[260px] w-full md:h-[361px]">
    <div className="absolute inset-0 overflow-hidden">
      <ImageFallback.Root className="contents">
        <ImageFallback.Image
          alt={`${name} banner`}
          className="h-90 w-full object-cover md:h-130"
          src={headerUrl}
        />
        <ImageFallback.Fallback>
          <div className="size-full bg-[linear-gradient(145deg,var(--theme-bg)_0%,#ffffff_58%,var(--theme-surface)_100%)]" />
          {headerLoading ? (
            <div className="absolute inset-0 animate-pulse bg-white/30" />
          ) : null}
        </ImageFallback.Fallback>
      </ImageFallback.Root>
      <div className="absolute inset-x-0 top-0 h-full bg-linear-to-b from-[#011A25]/45 via-[#011A25]/22 to-[#011A25]/0" />
    </div>
    <div className="-bottom-10 pointer-events-none absolute inset-x-0 h-[250px] bg-[linear-gradient(to_bottom,rgba(252,251,251,0)_0%,rgba(252,251,251,0)_40%,rgba(252,251,251,0.72)_72%,#FCFBFB_100%)] backdrop-blur-[8px] [mask-image:linear-gradient(to_bottom,transparent_0%,transparent_54%,black_78%,black_100%)]" />
  </div>
)

export const ProfileViewNewHeader = ({
  avatarLoading,
  avatarUrl,
  displayExpiryDate,
  name,
  owner,
  ownerReverseName,
  records,
  registrationDate,
}: ProfileViewNewHeaderProps) => (
  <div className="space-y-[21.7px] px-5 md:px-8">
    <div className="space-y-[13px]">
      <NameBadge name={name} />
      <ProfileDetails
        displayExpiryDate={displayExpiryDate}
        owner={owner}
        ownerReverseName={ownerReverseName}
        registrationDate={registrationDate}
      />
    </div>
    <div className="flex flex-col gap-6 md:flex-row md:items-stretch">
      <AvatarBlock
        avatarLoading={avatarLoading}
        avatarUrl={avatarUrl}
        name={name}
      />
      <AboutCard records={records} />
    </div>
  </div>
)
