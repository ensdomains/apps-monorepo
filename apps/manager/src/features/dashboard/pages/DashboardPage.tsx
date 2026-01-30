import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'motion/react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { MSymbol } from '@/components/ui/material-symbol'
import { FaqSection } from '@/features/dashboard/components/FaqSection'
import { NamesTable } from '@/features/dashboard/components/NamesTable'
import { PrimaryNameCard } from '@/features/dashboard/components/PrimaryNameCard'
import { parseAvatarQuery } from '@/features/profile/service/profileAvatar'
import { profileRecordsQuery } from '@/features/profile/service/profileRecords'
import { profileReverseNameQuery } from '@/features/profile/service/profileReverseName'
import { useSmartAccountContext } from '@/lib/smart-account'

const formatAddress = (value?: string | null) =>
  value ? `${value.slice(0, 6)}...${value.slice(-4)}` : '—'

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

  const { data: parsedAvatar } = useQuery({
    ...parseAvatarQuery(avatarRecord),
    enabled: !!avatarRecord,
  })

  const defaultName = reverseName ?? null
  const avatarUrl = parsedAvatar ?? null

  const displayName = defaultName ?? formatAddress(ownerAddress)
  const hasProfile = Boolean(defaultName)

  const stagger = (index: number) =>
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

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col items-start gap-4 py-6 md:flex-row md:gap-8 md:px-[58px] md:py-10">
      <div className="min-w-0 flex-1 space-y-6 md:space-y-8">
        <motion.div {...stagger(0)}>
          <Alert className="grid-cols-[calc(var(--spacing)*8)_1fr] rounded-none border-0 bg-[#e5f7ff] p-4 md:max-w-[50%] md:rounded-lg">
            <MSymbol
              className="ms-opsz-20 ms-wght-500 text-ens-blue"
              symbol="waving_hand"
            />
            <AlertTitle className="mb-2 text-[16px] text-ens-blue tracking-[0.28px]">
              Welcome to the public alpha of the ENS app
            </AlertTitle>
            <AlertDescription className="max-w-5xl text-muted-foreground text-sm">
              Welcome to the public alpha of the ENS App. You're seeing the
              earliest version of our app. There will be things that break,
              change, or disappear as we iterate. We'd love to hear what you
              think—share feedback anytime!
            </AlertDescription>
          </Alert>
        </motion.div>
        <motion.h1
          className="px-4 font-serif text-[28px] text-foreground leading-[0.96] tracking-[0.28px] md:px-0 md:text-[40px] md:tracking-[0.4px]"
          {...stagger(1)}
        >
          Hello {displayName}
        </motion.h1>
        {hasProfile && (
          <motion.div {...stagger(2)}>
            <PrimaryNameCard avatarUrl={avatarUrl} primaryName={defaultName} />
          </motion.div>
        )}
        <motion.div
          className="border-[0.25px] border-border bg-white px-4 py-6 md:rounded-lg md:px-6 md:py-8"
          {...stagger(hasProfile ? 3 : 2)}
        >
          <div className="space-y-5">
            <NamesTable primaryLabel={defaultName} />
          </div>
        </motion.div>
        <motion.div {...stagger(hasProfile ? 4 : 3)}>
          <FaqSection />
        </motion.div>
      </div>
    </div>
  )
}
