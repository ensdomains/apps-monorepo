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
  <div className="relative h-74 w-full xl:h-90.25">
    <div className="absolute inset-0 overflow-hidden">
      <img
        alt=""
        aria-hidden="true"
        className="absolute top-14 h-60 w-full object-cover xl:top-0 xl:h-130"
        src={loadingHeaderCoverUrl}
      />
      {!shouldReduceMotion && (
        <div className="pointer-events-none absolute top-14 h-60 w-full animate-shimmer bg-linear-to-r from-transparent via-white/30 to-transparent xl:top-0 xl:h-130" />
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
  <div className="flex min-w-0 flex-col items-start gap-0.5">
    <div
      className={cn(
        'flex items-center text-[13px] text-ens-quartz-500 leading-none',
        iconGapClassName,
      )}
    >
      <MSymbol className="ms-opsz-11 ms-wght-300 shrink-0" symbol={symbol} />
      <span>{label}</span>
    </div>
    <div className="flex min-w-0 items-center gap-0.5 py-1">
      <SkeletonBlock
        className={tw('h-[13px] rounded-sm', valueWidth)}
        shouldReduceMotion={shouldReduceMotion}
      />
      {hasCopy ? (
        <Copy className="size-[13px] shrink-0 text-ens-quartz-500" />
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
    className="relative min-h-130.75 rounded-none bg-transparent pt-15.5 shadow-none xl:min-h-0 xl:space-y-[21.7px] xl:px-8 xl:pt-0"
    {...getMotionProps(shouldReduceMotion)}
  >
    <NeutralAvatarLoading
      className="absolute -top-33 left-1/2 size-45.5 -translate-x-1/2 rounded-[18.889px] bg-ens-quartz-100 shadow-[0_4px_16px_rgba(0,0,0,0.12)] xl:hidden"
      shouldReduceMotion={shouldReduceMotion}
    />
    <div className="flex flex-col items-center xl:block xl:space-y-3.25">
      <ProfileNameBadgeLoading
        name={name}
        shouldReduceMotion={shouldReduceMotion}
      />
      <div className="mt-10 w-full px-5 xl:mt-0 xl:px-0">
        <div className="grid w-full grid-cols-1 gap-3 xl:max-w-full xl:flex-wrap xl:justify-start xl:gap-7 min-[375px]:flex min-[375px]:items-start min-[375px]:justify-between min-[375px]:gap-4">
          <ProfileDetailLoading
            hasCopy
            iconGapClassName="gap-0.5"
            label="Owner"
            shouldReduceMotion={shouldReduceMotion}
            symbol="key_vertical"
            valueWidth="w-15 xl:w-21"
          />
          <ProfileDetailLoading
            label="Registered"
            shouldReduceMotion={shouldReduceMotion}
            symbol="calendar_clock"
            valueWidth="w-14 xl:w-28"
          />
          <ProfileDetailLoading
            label="Expires"
            shouldReduceMotion={shouldReduceMotion}
            symbol="history"
            valueWidth="w-14 xl:w-28"
          />
        </div>
      </div>
      <div className="mt-6 w-[calc(100%-40px)] border-ens-quartz-200 border-t xl:hidden" />
    </div>

    <div className="mt-29 flex flex-col gap-6 px-5 xl:mt-0 xl:flex-row xl:items-stretch xl:px-0">
      <NeutralAvatarLoading
        className="hidden size-45.5 shrink-0 rounded-[18.889px] bg-ens-quartz-100 shadow-[0_4px_16px_rgba(0,0,0,0.12)] xl:block"
        shouldReduceMotion={shouldReduceMotion}
      />
      <Card className="min-h-0 flex-1 rounded-none border-0 bg-transparent p-0 shadow-none xl:min-h-45.5 xl:max-w-158.75 xl:rounded-xl xl:border-[0.5px] xl:bg-white xl:p-6 xl:shadow-temp-card">
        <div className="grid w-full gap-8 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start xl:justify-between xl:gap-8">
          <div className="min-w-0">
            <div className="flex items-start justify-between gap-3">
              <SkeletonBlock
                className="h-5 w-16"
                shouldReduceMotion={shouldReduceMotion}
              />
              <SkeletonBlock
                className="h-4 w-28 xl:hidden"
                shouldReduceMotion={shouldReduceMotion}
              />
            </div>
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
          <div className="flex min-w-0 flex-row-reverse items-start justify-between gap-4 xl:flex-col xl:gap-1.5 xl:justify-self-end">
            <div className="flex min-w-0 flex-col gap-1.5">
              {['timezone', 'language'].map((id) => (
                <div className="flex min-w-0 items-center gap-1" key={id}>
                  <SkeletonBlock
                    className="size-5 shrink-0 rounded"
                    shouldReduceMotion={shouldReduceMotion}
                  />
                  <SkeletonBlock
                    className={tw(
                      'h-[13px]',
                      id === 'timezone' ? 'w-36' : 'w-24',
                    )}
                    shouldReduceMotion={shouldReduceMotion}
                  />
                </div>
              ))}
            </div>
            <div className="flex min-w-0 items-center gap-1">
              <SkeletonBlock
                className="size-5 shrink-0 rounded"
                shouldReduceMotion={shouldReduceMotion}
              />
              <SkeletonBlock
                className="h-[13px] w-28"
                shouldReduceMotion={shouldReduceMotion}
              />
            </div>
          </div>
        </div>
      </Card>
    </div>
  </motion.div>
)
