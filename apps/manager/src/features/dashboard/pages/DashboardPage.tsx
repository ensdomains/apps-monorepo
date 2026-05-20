import { Trans } from '@lingui/react/macro'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'motion/react'
import { MSymbol } from '@/components/ui/material-symbol'
import { ChoosePrimaryNameDialog } from '@/features/dashboard/components/ChoosePrimaryNameDialog'
import { EducationCarousel } from '@/features/dashboard/components/EducationCarousel'
import { FaqSection } from '@/features/dashboard/components/FaqSection'
import { NamesTable } from '@/features/dashboard/components/NamesTable'
import { PrimaryNameCard } from '@/features/dashboard/components/PrimaryNameCard'
import { MigrationModal } from '@/features/migration/components/MigrationModal'
import { MigrationProgressBanner } from '@/features/migration/components/MigrationProgressBanner'
import { UpgradeBanner } from '@/features/migration/components/UpgradeBanner'
import { parseAvatarQuery } from '@/features/profile/service/profileAvatar'
import { profileRecordsQuery } from '@/features/profile/service/profileRecords'
import { profileReverseNameQuery } from '@/features/profile/service/profileReverseName'
import { useFeatureFlag } from '@/hooks/useFeatureFlag'
import { useSmartAccountContext } from '@/lib/smart-account'

const stagger = (index: number, shouldReduceMotion: boolean | null) =>
  shouldReduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        transition: {
          duration: 0.25,
          ease: [0.25, 0.46, 0.45, 0.94] as const,
          delay: index * 0.06,
        },
      }

export const DashboardPage = () => {
  const { ownerAddress } = useSmartAccountContext()
  const shouldReduceMotion = useReducedMotion()
  const migrationEnabled = useFeatureFlag('MIGRATION')

  const { data: reverseName } = useSuspenseQuery({
    ...profileReverseNameQuery(ownerAddress ?? undefined),
  })

  const { data: reverseRecords } = useQuery({
    ...profileRecordsQuery(reverseName ?? ''),
    enabled: !!reverseName,
  })

  const avatarRecord = reverseRecords?.texts.find(
    (text) => text.key === 'avatar',
  )?.value

  const themeColor = reverseRecords?.texts.find(
    (text) => text.key === 'theme',
  )?.value

  const { data: parsedAvatar } = useQuery({
    ...parseAvatarQuery(avatarRecord),
    enabled: !!avatarRecord,
  })

  const defaultName = reverseName ?? null
  const avatarUrl = parsedAvatar ?? null
  const hasProfile = Boolean(defaultName)

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col items-start gap-4 py-6 md:w-[calc(100%-4rem)] md:flex-row md:gap-8 md:py-10">
      {migrationEnabled && <MigrationModal />}
      <div className="min-w-0 flex-1 space-y-6 md:space-y-6">
        {migrationEnabled && (
          <motion.div className="w-full" {...stagger(0, shouldReduceMotion)}>
            <UpgradeBanner />
          </motion.div>
        )}
        {hasProfile ? (
          <motion.div {...stagger(1, shouldReduceMotion)}>
            <PrimaryNameCard
              avatarUrl={avatarUrl}
              primaryName={defaultName}
              themeColor={themeColor}
            />
          </motion.div>
        ) : (
          <motion.div
            className="flex flex-col items-start gap-3 border-[0.25px] border-border bg-white px-4 py-6 sm:flex-row sm:items-center sm:justify-between md:rounded-lg md:px-6 md:py-8"
            {...stagger(1, shouldReduceMotion)}
          >
            <span className="font-sans text-[16px] text-foreground">
              <Trans>You haven't set a primary name yet.</Trans>
            </span>
            <ChoosePrimaryNameDialog>
              <button
                className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-full border border-ens-blue/20 bg-ens-blue/5 px-3 py-1.5 text-ens-blue transition-colors hover:bg-ens-blue/10"
                type="button"
              >
                <MSymbol
                  className="ms-opsz-20 ms-wght-500 text-sm"
                  symbol="badge"
                />
                <span className="whitespace-nowrap font-medium font-sans text-xs">
                  <Trans>Set primary name</Trans>
                </span>
              </button>
            </ChoosePrimaryNameDialog>
          </motion.div>
        )}
        <motion.div
          className="border-[0.25px] border-border bg-white px-4 py-6 md:rounded-lg md:px-6 md:py-8"
          {...stagger(2, shouldReduceMotion)}
        >
          <NamesTable
            migrationEnabled={migrationEnabled}
            primaryLabel={defaultName}
          />
        </motion.div>
        {migrationEnabled && <MigrationProgressBanner />}
        <motion.div
          className="border-[0.25px] border-border bg-white px-4 py-6 md:rounded-lg md:px-6 md:py-8"
          {...stagger(3, shouldReduceMotion)}
        >
          <EducationCarousel />
        </motion.div>
        <motion.div {...stagger(4, shouldReduceMotion)}>
          <FaqSection />
        </motion.div>
      </div>
    </div>
  )
}
