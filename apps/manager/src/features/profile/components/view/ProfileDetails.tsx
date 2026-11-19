import { Trans } from '@lingui/react/macro'
import { Link, useHydrated } from '@tanstack/react-router'
import type { Address } from 'viem'
import { NameCopyButton } from '@/components/atoms/NameCopyButton/NameCopyButton'
import { cn, truncateAddress } from '@/lib/utils'
import { formatProfileDetailDate } from './ProfileView.helpers'

/**
 * Owner, parent (subnames only), registration, expiry and grace end under the
 * profile name, per the Explore CTA design (6714:73076).
 *
 * Each item stacks a 13px neutral-500 label over a 13px neutral-800 value,
 * 8px apart, with 28px between items and no icons. Names link to their page.
 * Dates stay short sentence case ("Oct 23, 2026") at every width. The items
 * wrap only when the row is narrower than their content.
 */

type ProfileDetailsProps = {
  readonly expiryDate?: Date | null
  /** The parent shown for a subname; null for second-level names. */
  readonly parentName?: string | null
  readonly graceEndDate?: Date | null
  readonly owner?: Address
  readonly ownerReverseName?: string | null
  readonly registrationDate?: number | null
}

// 13px text and 0.2px tracking have no tokens
const detailLabelClassName =
  'font-sans text-[13px] text-neutral-500 leading-none tracking-[0.2px]'
const detailValueClassName =
  'font-sans text-[13px] text-neutral-800 leading-none tracking-[0.2px]'
const detailLinkClassName =
  'text-inherit hover:underline focus-visible:underline focus-visible:outline-none'

/** Shared by the badge and its skeleton so the badge stays put on load. */
export const ProfileNameBadgeRow = ({
  badge,
  trailing,
}: {
  readonly badge: React.ReactNode
  readonly trailing: React.ReactNode
}) => (
  // Full width so the badge cap below resolves against the page, not the badge itself
  <div className="flex w-full items-center justify-center gap-1 xl:justify-start">
    {/* Mirrors the size-8 trailing slot to centre the badge below xl; only this spacer shrinks, and the badge cap leaves room for the button and gaps */}
    <div aria-hidden className="h-8 w-8 min-w-0 shrink xl:hidden" />
    <div className="flex max-w-[calc(100%-2.5rem)] shrink-0 xl:max-w-[calc(100%-2.25rem)]">
      {badge}
    </div>
    {trailing}
  </div>
)

export const ProfileNameBadge = ({ name }: { readonly name: string }) => (
  <ProfileNameBadgeRow
    badge={
      <div className="inline-flex min-w-0 items-center rounded-[3px] bg-[var(--theme-color,var(--color-ens-lapis-500))] px-3 py-1.5 text-white">
        <h1 className="truncate font-semi-mono text-[32px] leading-[1.12]">
          {name}
        </h1>
      </div>
    }
    trailing={<NameCopyButton name={name} />}
  />
)

const ProfileDetail = ({
  label,
  value,
}: {
  readonly label: React.ReactNode
  readonly value: React.ReactNode
}) => (
  <div className="flex min-w-0 max-w-full shrink-0 flex-col items-start gap-2">
    <div className={detailLabelClassName}>
      <span>{label}</span>
    </div>
    <div className="flex min-w-0 max-w-full items-center">
      <span className={cn(detailValueClassName, 'min-w-0 truncate')}>
        {value}
      </span>
    </div>
  </div>
)

export const ProfileDetails = ({
  expiryDate,
  graceEndDate,
  owner,
  ownerReverseName,
  parentName,
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
  const formattedExpiryDate = formatProfileDetailDate(expiryDate, timeZone)
  const formattedGraceEndDate = formatProfileDetailDate(graceEndDate, timeZone)

  return (
    <div className="flex min-w-0 flex-1 flex-row flex-wrap items-start justify-center gap-x-7 gap-y-4 xl:flex-nowrap xl:justify-start">
      {owner ? (
        <ProfileDetail
          label={<Trans>Owner</Trans>}
          value={
            <Link
              className={detailLinkClassName}
              params={{ address: owner }}
              to="/$address"
            >
              {ownerReverseName || truncateAddress(owner)}
            </Link>
          }
        />
      ) : null}
      {parentName ? (
        <ProfileDetail
          label={<Trans>Parent</Trans>}
          value={
            <Link
              className={detailLinkClassName}
              params={{ name: parentName }}
              to="/$name"
            >
              {parentName}
            </Link>
          }
        />
      ) : null}
      {formattedRegistrationDate ? (
        <ProfileDetail
          label={<Trans>Registered</Trans>}
          value={formattedRegistrationDate}
        />
      ) : null}
      {formattedExpiryDate ? (
        <div className="flex shrink-0 items-start gap-7">
          <ProfileDetail
            label={<Trans>Expires</Trans>}
            value={formattedExpiryDate}
          />
          {formattedGraceEndDate ? (
            <ProfileDetail
              label={<Trans>Grace period ends</Trans>}
              value={formattedGraceEndDate}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
