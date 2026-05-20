import { Trans, useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { Calendar, ChevronDown, History } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { match } from 'ts-pattern'
import { PatternAvatar } from '@/components/atoms/PatternAvatar/PatternAvatar'
import { LinkButton } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { MSymbol } from '@/components/ui/material-symbol'
import { formatDashboardDate } from '@/features/dashboard/utils'
import { profileExpiryQuery } from '@/features/profile/service/profileExpiry'
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

  const registeredDate =
    registration?.registrationDate != null
      ? new Date(registration.registrationDate * 1000)
      : null
  const expiryDate =
    reverseExpiry?.expiry != null
      ? new Date(Number(reverseExpiry.expiry) * 1000)
      : null
  const hasAvatar = Boolean(avatarUrl)
  const displayName = primaryName ?? t`Your ENS name`
  const registeredLabel = isRegistrationLoading
    ? t`Loading...`
    : formatDashboardDate(registeredDate)
  const expiryLabel = isReverseExpiryLoading
    ? t`Loading...`
    : formatDashboardDate(expiryDate)
  const canViewProfile = Boolean(primaryName)

  const themeVars = getThemeVars(themeColor) as React.CSSProperties

  return (
    <Card
      className="flex flex-col gap-4 rounded-none border-[0.25px] border-border bg-white p-4 shadow-none md:rounded-lg md:p-6"
      style={themeVars}
    >
      <PrimaryBadge className="self-start bg-ens-lapis-tint" />

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
          <div className="flex min-h-0 flex-col justify-between gap-4 md:h-50">
            <ChoosePrimaryNameDialog>
              <button
                className="flex cursor-pointer items-center gap-2 transition-opacity hover:opacity-80"
                type="button"
              >
                <span className="inline-flex items-center rounded-sm bg-(--theme-color) px-2 py-1 md:px-[8.5px] md:py-[4.25px]">
                  <span
                    className={
                      displayName.length > 10
                        ? 'font-medium font-semi-mono text-2xl text-ens-white leading-[0.96] tracking-[-0.48px]'
                        : 'font-medium font-semi-mono text-ens-white text-xl leading-[0.96] tracking-[-0.4px] md:text-[28px] md:tracking-[-0.56px]'
                    }
                  >
                    {displayName}
                  </span>
                </span>
                <ChevronDown
                  className="size-6 shrink-0 text-ens-quartz-400"
                  strokeWidth={2}
                />
              </button>
            </ChoosePrimaryNameDialog>
            <div className="flex flex-col gap-[8.5px]">
              <div className="flex items-center gap-2">
                <Calendar
                  className="size-5 text-ens-quartz-400"
                  strokeWidth={1.5}
                />
                <div className="flex items-center gap-1.5 text-base leading-normal">
                  <span className="text-ens-quartz-400">
                    <Trans>Registered</Trans>
                  </span>
                  <span className="font-semi-mono text-[13px] text-ens-quartz-700 tracking-[0.91px]">
                    {registeredLabel}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <History
                  className="size-5 text-ens-quartz-400"
                  strokeWidth={1.5}
                />
                <div className="flex items-center gap-1.5 text-base leading-normal">
                  <span className="text-ens-quartz-400">
                    <Trans>Expires</Trans>
                  </span>
                  <span className="font-semi-mono text-[13px] text-ens-quartz-700 tracking-[0.91px]">
                    {expiryLabel}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <LinkButton
          className="group flex h-auto w-full items-center justify-center gap-1.5 bg-transparent p-0 font-mono text-(--theme-color) uppercase tracking-wider hover:bg-transparent hover:text-(--theme-color) hover:no-underline hover:opacity-80 md:w-auto"
          disabled={!canViewProfile}
          params={{ name: primaryName ?? '' }}
          to="/$name"
          variant="link"
        >
          <span className="font-mono text-base leading-normal underline-offset-4 group-hover:underline">
            <Trans>View profile</Trans>
          </span>
          <MSymbol className="ms-opsz-20 text-base" symbol="arrow_forward" />
        </LinkButton>
      </div>
    </Card>
  )
}
