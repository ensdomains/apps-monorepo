import { Plural, Trans } from '@lingui/react/macro'
import { Hourglass } from 'lucide-react'
import { match, P } from 'ts-pattern'
import { LinkButton } from '@/components/ui/button'
import { formatDashboardDate } from '@/features/dashboard/utils'
import { V2_GRACE_PERIOD_DAYS } from '@/features/grace/utils/gracePeriod'

export type GracePeriodBannerVariant =
  | 'primaryExpired'
  | 'anyNameExpired'
  | 'profileOwnName'

type GracePeriodBannerProps = {
  readonly variant: GracePeriodBannerVariant
  readonly graceEndDate: Date
  readonly renewName: string
  readonly daysSinceExpiry?: number | null
  readonly isV2?: boolean
  /** Storybook / previews: render Renew without TanStack Router */
  readonly previewRenew?: boolean
}

const renewButtonClassName =
  'flex h-[37px] w-full items-center justify-center rounded-xs border-[#b35600] border-[0.5px] bg-transparent px-3 font-mono text-[#b35600] text-sm uppercase tracking-[0.28px] hover:bg-[#b35600]/5 @md:h-14 @md:w-[298px]'

const gracePeriodDaysLabel = (isV2: boolean): number =>
  match(isV2)
    .with(true, () => V2_GRACE_PERIOD_DAYS)
    .with(false, () => 90)
    .exhaustive()

const bannerTitle = (variant: GracePeriodBannerVariant) =>
  match(variant)
    .with('primaryExpired', () => <Trans>Your primary name has expired.</Trans>)
    .with('anyNameExpired', () => <Trans>One of your names expired.</Trans>)
    .with('profileOwnName', () => <Trans>Your name is in grace period</Trans>)
    .exhaustive()

const bannerBody = ({
  variant,
  daysSinceExpiry,
  graceDays,
  formattedGraceEnd,
}: {
  readonly variant: GracePeriodBannerVariant
  readonly daysSinceExpiry: number | null
  readonly graceDays: number
  readonly formattedGraceEnd: string
}) =>
  match({ variant, daysSinceExpiry })
    .with(
      {
        variant: 'primaryExpired',
        daysSinceExpiry: P.number,
      },
      ({ daysSinceExpiry }) => (
        <Trans>
          Your primary name expired{' '}
          <Plural one="# day" other="# days" value={daysSinceExpiry} /> ago and is
          now in its {graceDays}-day grace period. Renew by {formattedGraceEnd} to
          keep it. While in grace, the name won&apos;t work with its records.
        </Trans>
      ),
    )
    .otherwise(() => (
      <Trans>
        Your expired name is now in its {graceDays}-day grace period. Renew by{' '}
        {formattedGraceEnd} to keep it. While in grace, the name won&apos;t work
        with its records.
      </Trans>
    ))

export const GracePeriodBanner = ({
  variant,
  graceEndDate,
  renewName,
  daysSinceExpiry = null,
  isV2 = true,
  previewRenew = false,
}: GracePeriodBannerProps) => {
  const formattedGraceEnd = formatDashboardDate(graceEndDate)
  const graceDays = gracePeriodDaysLabel(isV2)

  return (
    <div className="@container w-full rounded-xs border-[0.5px] border-[#e1b77e] bg-[#f8f7e2] p-5">
      <div className="flex w-full flex-col gap-4 @md:flex-row @md:items-center @md:justify-between @md:gap-6">
        <div className="grid w-full min-w-0 grid-cols-[auto_1fr] gap-x-3 gap-y-2 @md:flex-1">
          <Hourglass
            aria-hidden
            className="col-start-1 row-span-2 row-start-1 size-6 shrink-0 self-start text-[#b35600]"
            strokeWidth={2}
          />
          <p className="col-start-2 row-start-1 min-w-0 font-sans text-[#b35600] text-base leading-[1.1] tracking-[-0.32px]">
            {bannerTitle(variant)}
          </p>
          <p className="col-start-2 row-start-2 min-w-0 font-sans text-[#984d1b] text-sm leading-[1.2] tracking-[0.14px]">
            {bannerBody({
              daysSinceExpiry,
              formattedGraceEnd,
              graceDays,
              variant,
            })}
          </p>
        </div>
        <div className="w-full shrink-0 @md:w-auto">
          {previewRenew ? (
            <span className={renewButtonClassName}>
              <Trans>Renew</Trans>
            </span>
          ) : (
            <LinkButton
              className={renewButtonClassName}
              params={{ name: renewName }}
              to="/renew/$name"
              variant="outline"
            >
              <Trans>Renew</Trans>
            </LinkButton>
          )}
        </div>
      </div>
    </div>
  )
}
