import { Plural, Trans } from '@lingui/react/macro'
import { match, P } from 'ts-pattern'
import { LinkButton } from '@/components/ui/button'
import { formatDashboardDate } from '@/features/dashboard/utils'
import { V2_GRACE_PERIOD_DAYS } from '@/features/grace/utils/gracePeriod'
import { GracePeriodCalendarIcon } from './GracePeriodCalendarIcon'

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
  'flex h-9 w-full items-center justify-center rounded-xs border border-ens-citrine-600 bg-transparent px-3 font-mono text-ens-citrine-600 text-sm uppercase tracking-wide hover:bg-ens-citrine-600/5 @md:h-14 @md:max-w-72 @md:w-full'

const bannerTitleClassName =
  'col-start-2 row-start-1 min-w-0 font-sans font-medium text-ens-citrine-600 text-xl leading-[110%] tracking-tight [leading-trim:both] [text-edge:cap]'

const bannerBodyClassName =
  'col-start-2 row-start-2 min-w-0 font-sans font-normal text-sm text-ens-citrine-500 leading-[120%] tracking-normal [leading-trim:both] [text-edge:cap]'

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
          <Plural one="# day" other="# days" value={daysSinceExpiry} /> ago and
          is now in its {graceDays}-day grace period. Renew by{' '}
          {formattedGraceEnd} to keep it. While in grace, the name won&apos;t
          work with its records.
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
    <div className="@container w-full rounded-xs border border-ens-citrine-300 bg-ens-citrine-100 p-4">
      <div className="flex w-full @md:flex-row flex-col @md:items-center @md:justify-between @md:gap-6 gap-4">
        <div className="grid w-full min-w-0 @md:flex-1 grid-cols-[auto_1fr] gap-x-3 gap-y-2">
          <GracePeriodCalendarIcon className="col-start-1 row-span-2 row-start-1 self-start text-ens-citrine-500" />
          <p className={bannerTitleClassName}>{bannerTitle(variant)}</p>
          <p className={bannerBodyClassName}>
            {bannerBody({
              daysSinceExpiry,
              formattedGraceEnd,
              graceDays,
              variant,
            })}
          </p>
        </div>
        <div className="@md:w-auto w-full shrink-0">
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
