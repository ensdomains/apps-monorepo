import { Trans, useLingui } from '@lingui/react/macro'
import { Link, useHydrated } from '@tanstack/react-router'
import type { Address } from 'viem'
import { MSymbol } from '@/components/ui/material-symbol'
import { useCopyFeedback } from '@/hooks/useCopyFeedback'
import { cn, truncateAddress } from '@/lib/utils'
import { formatProfileDetailDate } from './ProfileView.helpers'

/**
 * Owner, registration, and expiry under the profile name.
 *
 * Each item stacks a 13px quartz-500 label over a 13px quartz-700 value.
 * Dates stay short sentence case ("Oct 23, 2026") at every width.
 * The three items stay in one row and share the width evenly. They wrap
 * only when the row is narrower than their content.
 * The owner copy icon stays visible on touch and below xl; on desktop
 * fine pointers it appears on hover or focus-within.
 */

type ProfileDetailsProps = {
  readonly displayExpiryDate?: Date | null
  readonly owner?: Address
  readonly ownerReverseName?: string | null
  readonly registrationDate?: number | null
}

const detailLabelClassName =
  'flex items-center gap-0.5 font-sans text-[13px] text-ens-quartz-500 leading-none'
const detailValueClassName =
  'font-sans text-[13px] text-ens-quartz-700 leading-none tracking-[0.2px]'
const detailIconClassName =
  'ms-opsz-11 ms-wght-300 shrink-0 text-[11px] leading-[11px]'

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
      className="inline-flex size-[13px] shrink-0 items-center justify-center text-ens-quartz-500 xl:pointer-fine:opacity-0 xl:pointer-fine:group-hover:opacity-100 xl:pointer-fine:group-focus-within:opacity-100"
      onClick={() => copy(value)}
      title={t`Copy to clipboard`}
      type="button"
    >
      <MSymbol
        className="ms-opsz-11 ms-wght-400 text-[11px] leading-[11px]"
        symbol={copied ? 'check' : 'content_copy'}
      />
    </button>
  )
}

const ProfileDetail = ({
  icon,
  label,
  value,
  copyValue,
}: {
  readonly icon: React.ReactNode
  readonly label: React.ReactNode
  readonly value: React.ReactNode
  readonly copyValue?: string
}) => (
  <div className="group flex shrink-0 flex-col items-start gap-0.5 overflow-visible">
    <div className={detailLabelClassName}>
      {icon}
      <span>{label}</span>
    </div>
    <div className="relative flex min-w-0 max-w-full items-center py-1">
      <span className={cn(detailValueClassName, 'min-w-0 truncate')}>
        {value}
      </span>
      {copyValue ? (
        <span className="absolute top-1/2 left-full ml-0.5 -translate-y-1/2">
          <ProfileDetailCopyButton value={copyValue} />
        </span>
      ) : null}
    </div>
  </div>
)

export const ProfileDetails = ({
  displayExpiryDate,
  owner,
  ownerReverseName,
  registrationDate,
}: ProfileDetailsProps) => {
  const timeZone = useHydrated() ? 'local' : 'utc'
  const registrationDetailDate = registrationDate
    ? new Date(registrationDate * 1000)
    : undefined
  const formattedRegistrationDate = formatProfileDetailDate(
    registrationDetailDate,
    timeZone,
  )
  const formattedExpiryDate = formatProfileDetailDate(
    displayExpiryDate,
    timeZone,
  )

  return (
    <div className="flex min-w-0 flex-1 flex-row flex-wrap items-start justify-between gap-5 xl:flex-nowrap xl:justify-start">
      {owner ? (
        <ProfileDetail
          copyValue={owner}
          icon={
            <MSymbol className={detailIconClassName} symbol="key_vertical" />
          }
          label={<Trans>Owner</Trans>}
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
            <MSymbol className={detailIconClassName} symbol="calendar_clock" />
          }
          label={<Trans>Registered</Trans>}
          value={formattedRegistrationDate}
        />
      ) : null}
      {formattedExpiryDate ? (
        <ProfileDetail
          icon={<MSymbol className={detailIconClassName} symbol="history" />}
          label={<Trans>Expires</Trans>}
          value={formattedExpiryDate}
        />
      ) : null}
    </div>
  )
}
