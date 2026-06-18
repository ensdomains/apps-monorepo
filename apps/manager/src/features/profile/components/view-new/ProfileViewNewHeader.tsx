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
  getDisplayHost,
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
  'flex items-center text-ens-quartz-400 text-xs leading-[21px] md:text-base md:leading-normal'
const detailValueClassName =
  'font-sans text-[11px] text-ens-quartz-700 leading-[18px] tracking-[0.77px] md:text-[13px] md:leading-normal md:tracking-[0.91px]'

const getContactRecordValue = (records: ProfileRecords, key: string) =>
  records.contact.find((record) => record.key === key)?.value?.trim()

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
  <div className="flex min-w-0 flex-col items-start gap-0 md:flex-row md:items-center md:gap-1.5">
    <div className={cn(detailLabelClassName, iconGapClassName)}>
      {icon}
      <span>{label}</span>
    </div>
    <div className="flex min-w-0 items-center gap-1 pl-6 md:pl-0">
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
      className="inline-flex size-4 shrink-0 items-center justify-center text-ens-quartz-400 md:size-5"
      onClick={() => copy(value)}
      title={t`Copy to clipboard`}
      type="button"
    >
      <MSymbol
        className="ms-opsz-20 ms-wght-300 text-[16px] md:text-[20px]"
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
    <div className="grid w-full grid-cols-3 gap-3 md:flex md:max-w-full md:flex-wrap md:items-center md:gap-x-6 md:gap-y-3">
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
    <div className="flex min-w-0 items-start gap-1 text-ens-quartz-700 md:items-center">
      <span className="shrink-0 text-ens-quartz-700">{icon}</span>
      <span className="min-w-0 text-[12px] leading-[18px] md:truncate md:text-sm md:leading-normal">
        {value}
      </span>
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
    <section className="flex min-h-0 flex-1 rounded-none border-none bg-transparent p-0 shadow-none md:min-h-45.5 md:max-w-158.75 md:rounded-xl md:border-[0.25px] md:border-ens-quartz-300 md:bg-white md:p-6 md:shadow-[0_2px_6px_rgba(0,0,0,0.06)]">
      <div className="grid w-full gap-8 md:grid-cols-[minmax(0,346.5px)_228px] md:gap-3">
        <div className="min-w-0">
          <h2 className="text-base text-ens-quartz-700 leading-normal">
            <Trans>About</Trans>
          </h2>
          {records.base.description ? (
            <p className="mt-3 text-ens-quartz-500 text-sm leading-normal">
              {records.base.description}
            </p>
          ) : null}
          {websiteHref ? (
            <a
              className="mt-1 inline-flex max-w-full items-center gap-1 font-mono text-(--theme-color) text-sm leading-normal hover:opacity-80"
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
        <div className="grid min-w-0 grid-cols-3 gap-4 md:flex md:flex-col md:justify-start md:gap-1.5">
          <AboutMetaItem
            icon={
              <MSymbol
                className="ms-opsz-20 ms-wght-300 text-[20px] md:ms-opsz-24 md:text-[24px]"
                symbol="language"
              />
            }
            value={timezone}
          />
          <AboutMetaItem
            icon={
              <MSymbol
                className="ms-opsz-20 ms-wght-300 text-[20px] md:ms-opsz-24 md:text-[24px]"
                symbol="translate"
              />
            }
            value={language}
          />
          <AboutMetaItem
            icon={
              <MSymbol
                className="ms-opsz-20 ms-wght-300 text-[20px] md:ms-opsz-24 md:text-[24px]"
                symbol="distance"
              />
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
  className,
  name,
}: Pick<ProfileViewNewHeaderProps, 'avatarLoading' | 'avatarUrl' | 'name'> & {
  readonly className?: string
}) => (
  <div
    className={cn(
      'relative size-45.5 shrink-0 overflow-hidden rounded-[18.889px] bg-ens-quartz-100 shadow-[0_4px_16px_rgba(0,0,0,0.12)]',
      className,
    )}
  >
    <ImageFallback.Root className="contents">
      <ImageFallback.Image
        alt={`${name} avatar`}
        className="size-full object-cover"
        src={avatarUrl}
      />
      <ImageFallback.Fallback>
        <PatternAvatar
          className="size-full rounded-[18.889px] border-none bg-transparent p-0 shadow-none"
          name={name}
        />
        {avatarLoading ? (
          <div className="absolute inset-0 animate-pulse rounded-[18.889px] bg-ens-quartz-100/70" />
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
  <div className="relative h-74 w-full md:h-90.25">
    <div className="absolute inset-0 overflow-hidden">
      <ImageFallback.Root className="contents">
        <ImageFallback.Image
          alt={`${name} banner`}
          className="absolute top-14 h-60 w-full object-cover md:top-0 md:h-130"
          src={headerUrl}
        />
        <ImageFallback.Fallback>
          <div className="absolute top-14 h-60 w-full bg-[linear-gradient(145deg,var(--theme-bg)_0%,#ffffff_58%,var(--theme-surface)_100%)] md:top-0 md:h-full" />
          {headerLoading ? (
            <div className="absolute inset-0 animate-pulse bg-white/30" />
          ) : null}
        </ImageFallback.Fallback>
      </ImageFallback.Root>
    </div>
    <div className="-bottom-10 pointer-events-none absolute inset-x-0 h-62.5 bg-[linear-gradient(to_bottom,rgba(252,251,251,0)_0%,rgba(252,251,251,0)_40%,rgba(252,251,251,0.72)_72%,#FCFBFB_100%)] backdrop-blur-[8px] [mask-image:linear-gradient(to_bottom,transparent_0%,transparent_54%,black_78%,black_100%)]" />
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
  <div className="relative min-h-[555px] rounded-b-xl bg-white pt-[62px] shadow-[0_4px_24.1px_rgba(7,28,47,0.07)] md:min-h-0 md:space-y-[21.7px] md:rounded-none md:bg-transparent md:px-8 md:pt-0 md:shadow-none">
    <AvatarBlock
      avatarLoading={avatarLoading}
      avatarUrl={avatarUrl}
      className="-top-33 -translate-x-1/2 absolute left-1/2 md:hidden"
      name={name}
    />
    <div className="flex flex-col items-center md:block md:space-y-[13px]">
      <NameBadge name={name} />
      <div className="mt-10 w-full px-5 md:mt-0 md:px-0">
        <ProfileDetails
          displayExpiryDate={displayExpiryDate}
          owner={owner}
          ownerReverseName={ownerReverseName}
          registrationDate={registrationDate}
        />
      </div>
      <div className="mt-6 w-[calc(100%-40px)] border-ens-quartz-200 border-t md:hidden" />
    </div>
    <div className="mt-[91px] flex flex-col gap-6 px-5 md:mt-0 md:flex-row md:items-stretch md:px-0">
      <AvatarBlock
        avatarLoading={avatarLoading}
        avatarUrl={avatarUrl}
        className="hidden md:block"
        name={name}
      />
      <AboutCard records={records} />
    </div>
  </div>
)
