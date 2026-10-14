import { Trans, useLingui } from '@lingui/react/macro'
import { Link, useHydrated } from '@tanstack/react-router'
import { Check, Copy } from 'lucide-react'
import type { Address } from 'viem'
import { MSymbol } from '@/components/ui/material-symbol'
import { useCopyFeedback } from '@/hooks/useCopyFeedback'
import { cn, truncateAddress } from '@/lib/utils'
import { formatProfileDetailDate } from './ProfileView.helpers'

type ProfileDetailsProps = {
  readonly displayExpiryDate?: Date | null
  readonly owner?: Address
  readonly ownerReverseName?: string | null
  readonly registrationDate?: number | null
}

const detailLabelClassName =
  'relative flex items-center text-ens-quartz-400 text-xs leading-5.25 profile-desktop:text-base profile-desktop:leading-normal'
const detailValueClassName =
  'font-sans text-[11px] text-ens-quartz-700 leading-4.5 tracking-[0.77px] profile-desktop:text-[13px] profile-desktop:leading-normal profile-desktop:tracking-[0.91px]'

export const ProfileNameBadge = ({ name }: { readonly name: string }) => (
  <div className="inline-flex max-w-full items-center rounded-[3px] bg-[var(--theme-color,var(--color-ens-lapis-500))] px-3 py-1.5 text-white">
    <h1 className="truncate font-semi-mono text-[32px] leading-[1.12]">
      {name}
    </h1>
  </div>
)

const ProfileDetailCopyButton = ({ value }: { readonly value: string }) => {
  const { t } = useLingui()
  const { copied, copy } = useCopyFeedback()

  return (
    <button
      aria-label={t`Copy to clipboard`}
      className="inline-flex profile-desktop:size-5 size-4 shrink-0 items-center justify-center text-ens-quartz-400"
      onClick={() => copy(value)}
      title={t`Copy to clipboard`}
      type="button"
    >
      {copied ? (
        <Check className="profile-desktop:size-4 size-3.5" />
      ) : (
        <Copy className="profile-desktop:size-4 size-3.5" />
      )}
    </button>
  )
}

const ProfileDetailDateValue = ({
  date,
}: {
  readonly date: Date | null | undefined
}) => {
  const timeZone = useHydrated() ? 'local' : 'utc'
  const mobileValue = formatProfileDetailDate(date, 'mobile', timeZone)
  const desktopValue = formatProfileDetailDate(date, 'desktop', timeZone)

  if (!mobileValue || !desktopValue) return null

  return (
    <>
      <span className="profile-desktop:hidden">{mobileValue}</span>
      <span className="profile-desktop:inline hidden">{desktopValue}</span>
    </>
  )
}

const ProfileDetail = ({
  icon,
  label,
  value,
  copyValue,
  labelPaddingClassName = 'pl-8',
}: {
  readonly icon: React.ReactNode
  readonly label: React.ReactNode
  readonly value: React.ReactNode
  readonly copyValue?: string
  readonly labelPaddingClassName?: string
}) => (
  <div className="flex min-w-0 profile-desktop:flex-row flex-col items-start profile-desktop:items-baseline gap-0 profile-desktop:gap-1.5">
    <div className={cn(detailLabelClassName, labelPaddingClassName)}>
      <span className="absolute inset-y-0 left-0 flex items-center">
        {icon}
      </span>
      <span>{label}</span>
    </div>
    <div className="flex min-w-0 items-center gap-1 pl-6 profile-desktop:pl-0">
      <span className={`${detailValueClassName} truncate`}>{value}</span>
      {copyValue ? <ProfileDetailCopyButton value={copyValue} /> : null}
    </div>
  </div>
)

export const ProfileDetails = ({
  displayExpiryDate,
  owner,
  ownerReverseName,
  registrationDate,
}: ProfileDetailsProps) => {
  const registrationDetailDate = registrationDate
    ? new Date(registrationDate * 1000)
    : undefined
  const formattedRegistrationDate = formatProfileDetailDate(
    registrationDetailDate,
  )
  const formattedExpiryDate = formatProfileDetailDate(displayExpiryDate)

  return (
    <div className="profile-desktop:flex grid w-full profile-desktop:max-w-full grid-cols-3 profile-desktop:flex-wrap profile-desktop:items-center gap-3 profile-desktop:gap-x-6 profile-desktop:gap-y-3">
      {owner ? (
        <ProfileDetail
          copyValue={owner}
          icon={
            <MSymbol className="ms-opsz-20 ms-wght-300" symbol="key_vertical" />
          }
          label={<Trans>Owner</Trans>}
          labelPaddingClassName="pl-[22px]"
          value={
            <Link
              className="text-inherit hover:underline focus-visible:underline focus-visible:outline-none"
              params={{ address: owner }}
              to="/$address"
            >
              {ownerReverseName || truncateAddress(owner)}
            </Link>
          }
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
          value={<ProfileDetailDateValue date={registrationDetailDate} />}
        />
      ) : null}
      {formattedExpiryDate ? (
        <ProfileDetail
          icon={<MSymbol className="ms-opsz-20 ms-wght-300" symbol="history" />}
          label={<Trans>Expires</Trans>}
          value={<ProfileDetailDateValue date={displayExpiryDate} />}
        />
      ) : null}
    </div>
  )
}
