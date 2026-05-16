import { Trans, useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { Calendar, Clock } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { match } from 'ts-pattern'
import { PatternAvatar } from '@/components/atoms/PatternAvatar/PatternAvatar'
import { LinkButton } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { formatDashboardDate } from '@/features/dashboard/utils'
import {
  getProfileNameExpiryStatus,
  profileExpiryQuery,
} from '@/features/profile/service/profileExpiry'
import { profileRegistrationQuery } from '@/features/profile/service/profileRegistration'
import { getThemeVars } from '@/features/profile/utils/themeColor'
import { ChoosePrimaryNameDialog } from './ChoosePrimaryNameDialog'
import { PrimaryBadge } from './PrimaryBadge'

type PrimaryNameCardProps = {
  readonly primaryName?: string | null
  readonly avatarUrl?: string | null
  readonly themeColor?: string | null
}

export const PrimaryNameCard = ({
  primaryName,
  avatarUrl,
  themeColor,
}: PrimaryNameCardProps) => {
  const { t } = useLingui()
  const shouldReduceMotion = useReducedMotion()

  const { data: registration, isLoading: isRegistrationLoading } = useQuery({
    ...profileRegistrationQuery(primaryName ?? ''),
    enabled: !!primaryName,
  })

  const { data: reverseExpiry, isLoading: isReverseExpiryLoading } = useQuery({
    ...profileExpiryQuery(primaryName ?? ''),
    enabled: !!primaryName,
  })
  const { isInGrace, displayExpiryDate } = getProfileNameExpiryStatus(
    reverseExpiry?.expiry,
    true,
  )

  const registeredDate =
    registration?.registrationDate != null
      ? new Date(registration.registrationDate * 1000)
      : null
  const formattedRegisteredDate = formatDashboardDate(registeredDate)
  const formattedExpiryDate = formatDashboardDate(displayExpiryDate)
  const hasAvatar = Boolean(avatarUrl) && !isInGrace
  const displayName = primaryName ?? t`Your ENS name`
  const registeredLabel = isRegistrationLoading
    ? t`Loading...`
    : formattedRegisteredDate
  const expiryLabel = isReverseExpiryLoading ? t`Loading...` : formattedExpiryDate
  const canViewProfile = Boolean(primaryName)

  const themeVars = getThemeVars(themeColor) as React.CSSProperties
  const nameplateClassName = match(isInGrace)
    .with(
      true,
      () =>
        'inline-flex items-center rounded-sm border border-border bg-transparent px-2 py-1 md:px-[8.5px] md:py-[4.25px]',
    )
    .with(
      false,
      () =>
        'inline-flex items-center rounded-sm bg-(--theme-color) px-2 py-1 md:px-[8.5px] md:py-[4.25px]',
    )
    .exhaustive()
  const displayNameClassName = match({ isInGrace, isLongName: displayName.length > 10 })
    .with({ isInGrace: true }, () =>
      'font-medium font-mono text-[20px] text-foreground leading-[0.96] tracking-[-0.4px] md:text-[28px] md:tracking-[-0.56px]',
    )
    .with({ isInGrace: false, isLongName: true }, () =>
      'font-medium font-mono text-[24px] text-ens-white leading-[0.96] tracking-[-0.48px]',
    )
    .with({ isInGrace: false, isLongName: false }, () =>
      'font-medium font-mono text-[20px] text-ens-white leading-[0.96] tracking-[-0.4px] md:text-[28px] md:tracking-[-0.56px]',
    )
    .exhaustive()

  return (
    <Card
      className={match(isInGrace)
        .with(
          true,
          () =>
            'rounded-none border-[0.25px] border-border bg-white p-4 opacity-70 shadow-none md:rounded-lg md:p-6',
        )
        .with(
          false,
          () =>
            'rounded-none border-[0.25px] border-border bg-white p-4 shadow-none md:rounded-lg md:p-6',
        )
        .exhaustive()}
      style={match(isInGrace)
        .with(true, () => undefined)
        .with(false, () => themeVars)
        .exhaustive()}
    >
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between md:gap-8">
        <div className="flex flex-row items-start gap-4 md:gap-5">
          <motion.div
            className="size-20 shrink-0 overflow-hidden rounded-sm bg-ens-white md:size-50"
            {...(shouldReduceMotion
              ? {}
              : {
                  initial: { opacity: 0, scale: 0.95 },
                  animate: { opacity: 1, scale: 1 },
                  transition: {
                    duration: 0.25,
                    ease: [0.25, 0.46, 0.45, 0.94] as const,
                  },
                })}
          >
            {match(hasAvatar)
              .with(true, () => (
                <img
                  alt={displayName}
                  className="size-20 object-cover md:size-full"
                  src={avatarUrl as string}
                />
              ))
              .otherwise(() => (
                <PatternAvatar
                  className="size-20 rounded-sm border-none bg-transparent p-0 shadow-none md:size-full"
                  name={primaryName ?? ''}
                />
              ))}
          </motion.div>
          <div className="flex min-h-0 flex-col justify-between md:h-50">
            <ChoosePrimaryNameDialog>
              <button
                className="mb-4 flex cursor-pointer flex-col items-start gap-2 transition-opacity hover:opacity-80 md:gap-3"
                type="button"
              >
                <div className={nameplateClassName}>
                  <span className={displayNameClassName}>{displayName}</span>
                </div>
                <PrimaryBadge />
              </button>
            </ChoosePrimaryNameDialog>
            <div className="flex flex-col gap-[8.5px]">
              <div className="flex items-center gap-2">
                <Calendar
                  className="size-4 text-muted-foreground"
                  strokeWidth={1.5}
                />
                <div className="flex items-end gap-1 text-xs leading-[0.96] tracking-[-0.24px] md:text-sm">
                  <span className="text-muted-foreground">
                    <Trans>Registered</Trans>
                  </span>
                  <span className="font-semibold text-muted-foreground">
                    {registeredLabel}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Clock
                  className="size-4 text-muted-foreground"
                  strokeWidth={1.5}
                />
                <div className="flex items-end gap-1 text-xs leading-[0.96] tracking-[-0.24px] md:text-sm">
                  <span className="text-muted-foreground">
                    <Trans>Expires</Trans>
                  </span>
                  <span className="font-semibold text-muted-foreground">
                    {expiryLabel}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <LinkButton
          className="h-10 w-full rounded-xs border border-ens-blue px-[8.5px] py-[4.25px] font-mono text-ens-blue uppercase tracking-wider hover:bg-ens-blue/5 hover:text-ens-blue md:w-auto"
          disabled={!canViewProfile}
          params={{ name: primaryName ?? '' }}
          to="/$name"
          variant="outline"
        >
          <span className="font-sans text-sm leading-normal">
            <Trans>View profile</Trans>
          </span>
        </LinkButton>
      </div>
    </Card>
  )
}
