import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { CopyableAddress } from '@/components/atoms/CopyableAddress'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { MSymbol } from '@/components/ui/material-symbol'
import { EducationCarousel } from '@/features/dashboard/components/EducationCarousel'
import { FaqSection } from '@/features/dashboard/components/FaqSection'
import { NamesTable } from '@/features/dashboard/components/NamesTable'
import { PrimaryNameCard } from '@/features/dashboard/components/PrimaryNameCard'
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
  const { t } = useTranslation('dashboard')

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

  const { data: parsedAvatar } = useQuery({
    ...parseAvatarQuery(avatarRecord),
    enabled: !!avatarRecord,
  })

  const defaultName = reverseName ?? null
  const avatarUrl = parsedAvatar ?? null
  const hasProfile = Boolean(defaultName)

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col items-start gap-4 py-6 md:flex-row md:gap-8 md:px-[58px] md:py-10">
      <div className="min-w-0 flex-1 space-y-6 md:space-y-8">
        <motion.div {...stagger(0, shouldReduceMotion)}>
          <Alert className="grid-cols-[calc(var(--spacing)*8)_1fr] rounded-none border-0 bg-[#e5f7ff] p-4 md:max-w-[50%] md:rounded-lg">
            <MSymbol
              className="ms-opsz-20 ms-wght-500 text-ens-blue"
              symbol="waving_hand"
            />
            <AlertTitle className="mb-2 text-[16px] text-ens-blue tracking-[0.28px]">
              {t('page.banner.title')}
            </AlertTitle>
            <AlertDescription className="max-w-5xl text-muted-foreground text-sm">
              {t('page.banner.description')}
            </AlertDescription>
          </Alert>
        </motion.div>
        <motion.h1
          className="px-4 font-serif text-[28px] text-foreground leading-[0.96] tracking-[0.28px] md:px-0 md:text-[40px] md:tracking-[0.4px]"
          {...stagger(1, shouldReduceMotion)}
        >
          {t('page.greeting.hello')}{' '}
          {defaultName ??
            (ownerAddress && (
              <CopyableAddress
                address={ownerAddress}
                textClassName="font-serif text-[28px] leading-[0.96] tracking-[0.28px] md:text-[40px] md:tracking-[0.4px]"
                truncate={true}
              />
            ))}
        </motion.h1>
        {hasProfile && (
          <motion.div {...stagger(2, shouldReduceMotion)}>
            <PrimaryNameCard avatarUrl={avatarUrl} primaryName={defaultName} />
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
