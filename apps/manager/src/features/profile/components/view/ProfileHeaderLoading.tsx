import { Copy } from 'lucide-react'
import { motion } from 'motion/react'
import { Card } from '@/components/ui/card'
import {
  type MaterialSymbolProps,
  MSymbol,
} from '@/components/ui/material-symbol'
import { getLoadingHeaderCover } from '@/features/profile/utils/defaultHeaderCover'
import { cn } from '@/lib/utils'
import { tw } from '@/utils/tailwind'
import { getMotionProps, SkeletonBlock } from './ProfileLoadingPrimitives'

const neutralAvatarCellIds = Array.from({ length: 36 }, (_, index) => index)
const neutralAvatarFilledCells = new Set([
  0, 2, 4, 6, 12, 18, 24, 30, 31, 32, 33, 34, 35, 11, 15, 16, 20, 22, 27, 28,
])
const loadingHeaderCoverUrl = getLoadingHeaderCover()

export const ProfileBannerLoading = ({
  shouldReduceMotion,
}: {
  readonly shouldReduceMotion: boolean
}) => (
  <div className="relative h-74 profile-desktop:h-90.25 w-full">
    <div className="absolute inset-0 overflow-hidden">
      <img
        alt=""
        aria-hidden="true"
        className="absolute profile-desktop:top-0 top-14 h-60 profile-desktop:h-130 w-full object-cover"
        src={loadingHeaderCoverUrl}
      />
      {!shouldReduceMotion && (
        <div className="pointer-events-none absolute profile-desktop:top-0 top-14 h-60 profile-desktop:h-130 w-full animate-shimmer bg-linear-to-r from-transparent via-white/30 to-transparent" />
      )}
    </div>
    <div className="mask-[linear-gradient(to_bottom,transparent_0%,transparent_54%,black_78%,black_100%)] pointer-events-none absolute inset-x-0 -bottom-10 h-62.5 bg-[linear-gradient(to_bottom,rgba(252,251,251,0)_0%,rgba(252,251,251,0)_40%,rgba(252,251,251,0.72)_72%,#FCFBFB_100%)] backdrop-blur-sm" />
  </div>
)

const NeutralAvatarLoading = ({
  className,
  shouldReduceMotion,
}: {
  readonly className?: string
  readonly shouldReduceMotion: boolean
}) => (
  <div
    className={cn(
      'relative size-45.5 shrink-0 overflow-hidden rounded-[18.889px] bg-ens-quartz-100 p-3 shadow-[0_4px_16px_rgba(0,0,0,0.12)]',
      className,
    )}
  >
    <div className="grid size-full grid-cols-6 grid-rows-6 gap-1.5">
      {neutralAvatarCellIds.map((cellId) => (
        <div
          className={tw(
            'rounded-xs',
            neutralAvatarFilledCells.has(cellId)
              ? 'bg-ens-quartz-300'
              : 'bg-ens-quartz-200/45',
          )}
          key={`avatar-cell-${cellId}`}
        />
      ))}
    </div>
    {shouldReduceMotion ? null : (
      <div className="pointer-events-none absolute inset-0 animate-shimmer bg-linear-to-r from-transparent via-white/30 to-transparent" />
    )}
  </div>
)

const ProfileNameBadgeLoading = ({
  name,
  shouldReduceMotion,
}: {
  readonly name?: string
  readonly shouldReduceMotion: boolean
}) => (
  <div
    className={tw(
      'relative inline-flex max-w-full items-center overflow-hidden rounded-[3px] px-3 py-1.5',
      name ? 'bg-ens-quartz-700 text-white' : 'bg-ens-quartz-200',
    )}
  >
    {name ? (
      <h1 className="truncate font-semi-mono text-[32px] leading-[1.12]">
        {name}
      </h1>
    ) : (
      <div className="h-[35.84px] w-56" />
    )}
    {shouldReduceMotion ? null : (
      <div className="pointer-events-none absolute inset-0 animate-shimmer bg-linear-to-r from-transparent via-white/15 to-transparent" />
    )}
  </div>
)

const ProfileDetailLoading = ({
  hasCopy,
  iconGapClassName = 'gap-3',
  label,
  shouldReduceMotion,
  symbol,
  valueWidth,
}: {
  readonly hasCopy?: boolean
  readonly iconGapClassName?: string
  readonly label: string
  readonly shouldReduceMotion: boolean
  readonly symbol: MaterialSymbolProps['symbol']
  readonly valueWidth: string
}) => (
  <div className="flex min-w-0 profile-desktop:flex-row flex-col items-start profile-desktop:items-center gap-0 profile-desktop:gap-1.5">
    <div
      className={cn(
        'flex items-center profile-desktop:text-base text-ens-quartz-400 text-xs leading-5.25 profile-desktop:leading-normal',
        iconGapClassName,
      )}
    >
      <MSymbol className="ms-opsz-20 ms-wght-300 shrink-0" symbol={symbol} />
      <span>{label}</span>
    </div>
    <div className="flex min-w-0 items-center gap-1 pl-6 profile-desktop:pl-0">
      <SkeletonBlock
        className={tw('h-4.5 profile-desktop:h-5 rounded-sm', valueWidth)}
        shouldReduceMotion={shouldReduceMotion}
      />
      {hasCopy ? (
        <Copy className="profile-desktop:size-4 size-3.5 shrink-0 text-ens-quartz-400" />
      ) : null}
    </div>
  </div>
)

export const ProfileHeaderLoading = ({
  name,
  shouldReduceMotion,
}: {
  readonly name?: string
  readonly shouldReduceMotion: boolean
}) => (
  <motion.div
    className="relative min-h-130.75 profile-desktop:min-h-0 profile-desktop:space-y-[21.7px] rounded-none bg-transparent profile-desktop:px-8 profile-desktop:pt-0 pt-15.5 shadow-none"
    {...getMotionProps(shouldReduceMotion)}
  >
    <NeutralAvatarLoading
      className="absolute -top-33 left-1/2 profile-desktop:hidden size-45.5 -translate-x-1/2 rounded-[18.889px] bg-ens-quartz-100 shadow-[0_4px_16px_rgba(0,0,0,0.12)]"
      shouldReduceMotion={shouldReduceMotion}
    />
    <div className="profile-desktop:block flex flex-col items-center profile-desktop:space-y-3.25">
      <ProfileNameBadgeLoading
        name={name}
        shouldReduceMotion={shouldReduceMotion}
      />
      <div className="mt-10 profile-desktop:mt-0 w-full profile-desktop:px-0 px-5">
        <div className="profile-desktop:flex grid w-full profile-desktop:max-w-full grid-cols-3 profile-desktop:flex-wrap profile-desktop:items-center gap-3 profile-desktop:gap-x-6 profile-desktop:gap-y-3">
          <ProfileDetailLoading
            hasCopy
            iconGapClassName="gap-0.5"
            label="Owner"
            shouldReduceMotion={shouldReduceMotion}
            symbol="key_vertical"
            valueWidth="w-15 profile-desktop:w-21"
          />
          <ProfileDetailLoading
            label="Registered"
            shouldReduceMotion={shouldReduceMotion}
            symbol="calendar_clock"
            valueWidth="w-14 profile-desktop:w-28"
          />
          <ProfileDetailLoading
            label="Expires"
            shouldReduceMotion={shouldReduceMotion}
            symbol="history"
            valueWidth="w-14 profile-desktop:w-28"
          />
        </div>
      </div>
      <div className="mt-6 profile-desktop:hidden w-[calc(100%-40px)] border-ens-quartz-200 border-t" />
    </div>

    <div className="mt-29 profile-desktop:mt-0 flex profile-desktop:flex-row flex-col profile-desktop:items-stretch gap-6 profile-desktop:px-0 px-5">
      <NeutralAvatarLoading
        className="profile-desktop:block hidden size-45.5 shrink-0 rounded-[18.889px] bg-ens-quartz-100 shadow-[0_4px_16px_rgba(0,0,0,0.12)]"
        shouldReduceMotion={shouldReduceMotion}
      />
      <Card className="min-h-0 profile-desktop:min-h-45.5 profile-desktop:max-w-158.75 flex-1 profile-desktop:rounded-xl rounded-none border-0 profile-desktop:border-[0.5px] bg-transparent profile-desktop:bg-white p-0 profile-desktop:p-6 profile-desktop:shadow-temp-card shadow-none">
        <div className="grid w-full profile-desktop:grid-cols-[minmax(0,346.5px)_228px] gap-8 profile-desktop:gap-3">
          <div className="min-w-0">
            <SkeletonBlock
              className="h-5 w-16"
              shouldReduceMotion={shouldReduceMotion}
            />
            <div className="mt-4 space-y-3">
              <SkeletonBlock
                className="h-4 w-full"
                shouldReduceMotion={shouldReduceMotion}
              />
              <SkeletonBlock
                className="h-4 w-5/6"
                shouldReduceMotion={shouldReduceMotion}
              />
              <SkeletonBlock
                className="h-4 w-2/3"
                shouldReduceMotion={shouldReduceMotion}
              />
            </div>
          </div>
          <div className="profile-desktop:flex grid min-w-0 grid-cols-3 profile-desktop:flex-col profile-desktop:justify-start gap-4 profile-desktop:gap-1.5">
            {['timezone', 'language', 'location'].map((id, index) => (
              <div
                className="flex min-w-0 items-start profile-desktop:items-center gap-1"
                key={id}
              >
                <SkeletonBlock
                  className="profile-desktop:size-6 size-5 shrink-0 rounded"
                  shouldReduceMotion={shouldReduceMotion}
                />
                <SkeletonBlock
                  className={tw(
                    'h-5',
                    index === 0 ? 'w-36' : index === 1 ? 'w-24' : 'w-28',
                  )}
                  shouldReduceMotion={shouldReduceMotion}
                />
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  </motion.div>
)
