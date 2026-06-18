import clsx from 'clsx'
import { motion, useReducedMotion } from 'motion/react'
import { getThemeVars } from '@/features/profile/utils/themeColor'

type SkeletonBlockProps = {
  readonly className?: string
  readonly isSolid?: boolean
  readonly shouldReduceMotion: boolean
}

type SkeletonCardConfig = {
  readonly id: string
  readonly columns?: string
  readonly rowWidths: readonly string[]
}

const cardConfigs: readonly SkeletonCardConfig[] = [
  {
    id: 'profile-new-contact',
    columns: 'md:grid-cols-3',
    rowWidths: ['w-3/5', 'w-4/5', 'w-2/3'],
  },
  {
    id: 'profile-new-addresses',
    columns: 'md:grid-cols-[minmax(0,530px)]',
    rowWidths: ['w-full', 'w-11/12'],
  },
  {
    id: 'profile-new-social',
    columns: 'md:grid-cols-3',
    rowWidths: ['w-2/3', 'w-3/4', 'w-7/12'],
  },
] as const

const easing = [0.25, 0.46, 0.45, 0.94] as const
const themeVars = getThemeVars()

const getMotionProps = (shouldReduceMotion: boolean, delay = 0) =>
  shouldReduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        transition: {
          duration: 0.24,
          ease: easing,
          delay,
        },
      }

const SkeletonBlock = ({
  className,
  isSolid = false,
  shouldReduceMotion,
}: SkeletonBlockProps) => (
  <div
    className={clsx(
      'relative overflow-hidden rounded-md',
      isSolid ? 'bg-ens-quartz-200' : 'bg-ens-quartz-200/75',
      className,
    )}
  >
    {!shouldReduceMotion && (
      <div className="pointer-events-none absolute inset-0 animate-shimmer bg-linear-to-r from-transparent via-white/25 to-transparent" />
    )}
  </div>
)

const ProfileViewNewBannerLoading = ({
  shouldReduceMotion,
}: {
  readonly shouldReduceMotion: boolean
}) => (
  <div className="relative h-65 w-full md:h-90.25">
    <div className="absolute inset-0 overflow-hidden">
      <div className="size-full bg-[linear-gradient(145deg,var(--theme-bg)_0%,#ffffff_58%,var(--theme-surface)_100%)]" />
      {!shouldReduceMotion && (
        <div className="pointer-events-none absolute inset-0 animate-shimmer bg-linear-to-r from-transparent via-white/30 to-transparent" />
      )}
      <div className="absolute inset-x-0 top-0 h-full bg-linear-to-b from-[#011A25]/45 via-[#011A25]/22 to-[#011A25]/0" />
    </div>
    <div className="-bottom-10 pointer-events-none absolute inset-x-0 h-62.5 bg-[linear-gradient(to_bottom,rgba(252,251,251,0)_0%,rgba(252,251,251,0)_40%,rgba(252,251,251,0.72)_72%,#FCFBFB_100%)] backdrop-blur-[8px] [mask-image:linear-gradient(to_bottom,transparent_0%,transparent_54%,black_78%,black_100%)]" />
  </div>
)

const ProfileViewNewHeaderLoading = ({
  shouldReduceMotion,
}: {
  readonly shouldReduceMotion: boolean
}) => (
  <motion.div
    className="space-y-[21.7px] px-5 md:px-8"
    {...getMotionProps(shouldReduceMotion)}
  >
    <div className="space-y-[13px]">
      <SkeletonBlock
        className="h-11 w-[min(315px,100%)] rounded-[3px] bg-(--theme-color)"
        isSolid
        shouldReduceMotion={shouldReduceMotion}
      />
      <div className="flex max-w-full flex-wrap items-center gap-x-6 gap-y-3">
        <SkeletonBlock
          className="h-5 w-36"
          shouldReduceMotion={shouldReduceMotion}
        />
        <SkeletonBlock
          className="h-5 w-32"
          shouldReduceMotion={shouldReduceMotion}
        />
        <SkeletonBlock
          className="h-5 w-32"
          shouldReduceMotion={shouldReduceMotion}
        />
      </div>
    </div>

    <div className="flex flex-col gap-6 md:flex-row md:items-stretch">
      <SkeletonBlock
        className="size-37 shrink-0 rounded-xl shadow-[0_4px_16px_rgba(0,0,0,0.12)] md:size-45.5"
        isSolid
        shouldReduceMotion={shouldReduceMotion}
      />
      <div className="flex min-h-45.5 flex-1 rounded-xl border-[0.25px] border-ens-quartz-300 bg-white p-6 shadow-[0_2px_6px_rgba(0,0,0,0.06)] md:max-w-158.75">
        <div className="grid w-full gap-6 md:grid-cols-[minmax(0,1fr)_228px]">
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
          <div className="flex min-w-0 flex-col justify-start gap-3">
            <SkeletonBlock
              className="h-4 w-36"
              shouldReduceMotion={shouldReduceMotion}
            />
            <SkeletonBlock
              className="h-4 w-28"
              shouldReduceMotion={shouldReduceMotion}
            />
            <SkeletonBlock
              className="h-4 w-32"
              shouldReduceMotion={shouldReduceMotion}
            />
          </div>
        </div>
      </div>
    </div>
  </motion.div>
)

const ProfileViewNewCardLoading = ({
  config,
  index,
  shouldReduceMotion,
}: {
  readonly config: SkeletonCardConfig
  readonly index: number
  readonly shouldReduceMotion: boolean
}) => (
  <motion.section
    className="px-5 py-6 md:px-8 md:pt-8 md:pb-6"
    {...getMotionProps(shouldReduceMotion, index * 0.05)}
  >
    <SkeletonBlock
      className="h-5 w-24"
      shouldReduceMotion={shouldReduceMotion}
    />
    <div className={clsx('mt-6 grid gap-4 md:gap-6', config.columns)}>
      {config.rowWidths.map((width, rowIndex) => (
        <div
          className="relative flex min-h-33.5 w-full flex-col rounded-xl border-[0.25px] border-ens-quartz-300 bg-white p-6 shadow-[0_2px_6px_rgba(0,0,0,0.06)]"
          key={`${config.id}-${rowIndex}`}
        >
          <SkeletonBlock
            className="size-7 rounded"
            shouldReduceMotion={shouldReduceMotion}
          />
          <div className="mt-auto min-w-0 space-y-2 pt-4">
            <SkeletonBlock
              className="h-3 w-16"
              shouldReduceMotion={shouldReduceMotion}
            />
            <SkeletonBlock
              className={clsx('h-4', width)}
              shouldReduceMotion={shouldReduceMotion}
            />
          </div>
        </div>
      ))}
    </div>
  </motion.section>
)

const ProfileViewNewActionsLoading = ({
  shouldReduceMotion,
}: {
  readonly shouldReduceMotion: boolean
}) => (
  <div className="fixed right-0 bottom-0 left-0 z-40 min-h-19.5 rounded-t-[32px] bg-white px-3 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] shadow-[0_-13px_28px_rgba(0,0,0,0.02),0_-52px_52px_rgba(0,0,0,0.02),0_-117px_70px_rgba(0,0,0,0.01)]">
    <div className="mx-auto flex max-w-226.25 items-center justify-center gap-3 overflow-x-auto">
      <SkeletonBlock
        className="size-13.5 shrink-0 rounded bg-(--theme-bg)"
        shouldReduceMotion={shouldReduceMotion}
      />
      <SkeletonBlock
        className="size-13.5 shrink-0 rounded bg-(--theme-bg)"
        shouldReduceMotion={shouldReduceMotion}
      />
      <SkeletonBlock
        className="h-13.5 w-45.75 shrink-0 rounded bg-(--theme-bg)"
        shouldReduceMotion={shouldReduceMotion}
      />
      <SkeletonBlock
        className="h-13.5 w-45.75 shrink-0 rounded border border-(--theme-color) bg-white"
        shouldReduceMotion={shouldReduceMotion}
      />
    </div>
  </div>
)

export const ProfileViewNewLoading = () => {
  const shouldReduceMotion = useReducedMotion() ?? false

  return (
    <div
      className="relative min-h-screen pb-28"
      style={themeVars as React.CSSProperties}
    >
      <ProfileViewNewBannerLoading shouldReduceMotion={shouldReduceMotion} />
      <div className="-mt-17.25 relative z-10 mx-auto w-full max-w-226.25 space-y-0">
        <ProfileViewNewHeaderLoading shouldReduceMotion={shouldReduceMotion} />
        <div className="space-y-0 px-5 md:px-0">
          {cardConfigs.map((config, index) => (
            <ProfileViewNewCardLoading
              config={config}
              index={index + 1}
              key={config.id}
              shouldReduceMotion={shouldReduceMotion}
            />
          ))}
        </div>
      </div>
      <ProfileViewNewActionsLoading shouldReduceMotion={shouldReduceMotion} />
    </div>
  )
}
