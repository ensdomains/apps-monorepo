import { Trans } from '@lingui/react/macro'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'motion/react'
import { CopyableAddress } from '@/components/atoms/CopyableAddress'
import { MSymbol } from '@/components/ui/material-symbol'
import { ChoosePrimaryNameDialog } from '@/features/dashboard/components/ChoosePrimaryNameDialog'
import { EducationCarousel } from '@/features/dashboard/components/EducationCarousel'
import { FaqSection } from '@/features/dashboard/components/FaqSection'
import { NamesTable } from '@/features/dashboard/components/NamesTable'
import { PrimaryNameCard } from '@/features/dashboard/components/PrimaryNameCard'
import { MigrationModal } from '@/features/migration/components/MigrationModal'
import { UpgradeBanner } from '@/features/migration/components/UpgradeBanner'
import { parseAvatarQuery } from '@/features/profile/service/profileAvatar'
import { profileRecordsQuery } from '@/features/profile/service/profileRecords'
import { profileReverseNameQuery } from '@/features/profile/service/profileReverseName'
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
    <div className="mx-auto flex max-w-[1440px] flex-col items-start gap-4 py-6 md:flex-row md:gap-8 md:px-[58px] md:py-10">
      <MigrationModal />
      <div className="min-w-0 flex-1 space-y-6 md:space-y-8">
        <motion.div className="w-full" {...stagger(0, shouldReduceMotion)}>
          <UpgradeBanner />
        </motion.div>
        <motion.div
          className="flex items-center gap-3 px-4 md:px-0"
          {...stagger(1, shouldReduceMotion)}
        >
          <h1 className="font-serif text-[28px] text-foreground leading-[0.96] tracking-[0.28px] md:text-[40px] md:tracking-[0.4px]">
            <Trans>Hello</Trans>{' '}
            {defaultName ??
              (ownerAddress && (
                <CopyableAddress
                  address={ownerAddress}
                  textClassName="font-serif text-[28px] leading-[0.96] tracking-[0.28px] md:text-[40px] md:tracking-[0.4px]"
                  truncate={true}
                />
              ))}
          </h1>
          {!hasProfile && (
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
          )}
        </motion.div>
        {hasProfile && (
          <motion.div {...stagger(2, shouldReduceMotion)}>
            <PrimaryNameCard
              avatarUrl={avatarUrl}
              primaryName={defaultName}
              themeColor={themeColor}
            />
          </motion.div>
        )}
        <motion.div
          className="border-[0.25px] border-border bg-white px-4 py-6 md:rounded-lg md:px-6 md:py-8"
          {...stagger(hasProfile ? 3 : 2, shouldReduceMotion)}
        >
          <div className="space-y-5">
            <NamesTable primaryLabel={defaultName} />
          </div>
        </motion.div>
        <motion.div
          className="border-[0.25px] border-border bg-white px-4 py-6 md:rounded-lg md:px-6 md:py-8"
          {...stagger(hasProfile ? 4 : 3, shouldReduceMotion)}
        >
          <EducationCarousel />
        </motion.div>
        <motion.div {...stagger(hasProfile ? 5 : 4, shouldReduceMotion)}>
          <FaqSection />
        </motion.div>
      </div>
    </div>
  )
}
