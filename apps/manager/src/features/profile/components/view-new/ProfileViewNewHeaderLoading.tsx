import clsx from 'clsx'
import { motion } from 'motion/react'
import {
  getMotionProps,
  SkeletonBlock,
} from './ProfileViewNewLoadingPrimitives'

export const ProfileViewNewBannerLoading = ({
  shouldReduceMotion,
}: {
  readonly shouldReduceMotion: boolean
}) => (
  <div className="relative h-74 w-full lg:landscape:h-90.25">
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute top-14 h-60 w-full bg-linear-to-br from-ens-quartz-100 via-white to-ens-quartz-200 lg:landscape:top-0 lg:landscape:h-130" />
      {!shouldReduceMotion && (
        <div className="pointer-events-none absolute top-14 h-60 w-full animate-pulse bg-white/20 lg:landscape:top-0 lg:landscape:h-130" />
      )}
    </div>
    <div className="pointer-events-none absolute inset-x-0 -bottom-10 h-62.5 bg-[linear-gradient(to_bottom,rgba(252,251,251,0)_0%,rgba(252,251,251,0)_40%,rgba(252,251,251,0.72)_72%,#FCFBFB_100%)] backdrop-blur-[8px] [mask-image:linear-gradient(to_bottom,transparent_0%,transparent_54%,black_78%,black_100%)]" />
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
    className={clsx(
      'relative inline-flex max-w-full items-center overflow-hidden rounded-[3px] bg-ens-quartz-200 px-3 py-1.5',
      !shouldReduceMotion && 'animate-pulse',
    )}
  >
    {name ? (
      <h1 className="invisible truncate font-semi-mono text-[32px] leading-[1.12]">
        {name}
      </h1>
    ) : (
      <div className="h-[35.84px] w-56" />
    )}
  </div>
)

const ProfileDetailLoading = ({
  shouldReduceMotion,
  valueWidth,
}: {
  readonly shouldReduceMotion: boolean
  readonly valueWidth: string
}) => (
  <div className="flex min-w-0 flex-col items-start gap-0 lg:landscape:flex-row lg:landscape:items-center lg:landscape:gap-1.5">
    <div className="flex items-center gap-1.5">
      <SkeletonBlock
        className="size-5 rounded"
        shouldReduceMotion={shouldReduceMotion}
      />
      <SkeletonBlock
        className="h-5 w-14 lg:landscape:w-16"
        shouldReduceMotion={shouldReduceMotion}
      />
    </div>
    <div className="flex min-w-0 items-center gap-1 pl-6 lg:landscape:pl-0">
      <SkeletonBlock
        className={clsx('h-5', valueWidth)}
        shouldReduceMotion={shouldReduceMotion}
      />
      <SkeletonBlock
        className="size-5 rounded"
        shouldReduceMotion={shouldReduceMotion}
      />
    </div>
  </div>
)

export const ProfileViewNewHeaderLoading = ({
  name,
  shouldReduceMotion,
}: {
  readonly name?: string
  readonly shouldReduceMotion: boolean
}) => (
  <motion.div
    className="relative min-h-[555px] rounded-none bg-transparent pt-[62px] shadow-none lg:landscape:min-h-0 lg:landscape:space-y-[21.7px] lg:landscape:px-8 lg:landscape:pt-0"
    {...getMotionProps(shouldReduceMotion)}
  >
    <SkeletonBlock
      className="absolute -top-33 left-1/2 size-45.5 -translate-x-1/2 rounded-[18.889px] bg-ens-quartz-100 shadow-[0_4px_16px_rgba(0,0,0,0.12)] lg:landscape:hidden"
      isSolid
      shouldReduceMotion={shouldReduceMotion}
    />
    <div className="flex flex-col items-center lg:landscape:block lg:landscape:space-y-[13px]">
      <ProfileNameBadgeLoading
        name={name}
        shouldReduceMotion={shouldReduceMotion}
      />
      <div className="mt-10 w-full px-5 lg:landscape:mt-0 lg:landscape:px-0">
        <div className="grid w-full grid-cols-3 gap-3 lg:landscape:flex lg:landscape:max-w-full lg:landscape:flex-wrap lg:landscape:items-center lg:landscape:gap-x-6 lg:landscape:gap-y-3">
          <ProfileDetailLoading
            shouldReduceMotion={shouldReduceMotion}
            valueWidth="w-15 lg:landscape:w-28"
          />
          <ProfileDetailLoading
            shouldReduceMotion={shouldReduceMotion}
            valueWidth="w-14 lg:landscape:w-24"
          />
          <ProfileDetailLoading
            shouldReduceMotion={shouldReduceMotion}
            valueWidth="w-14 lg:landscape:w-24"
          />
        </div>
      </div>
      <div className="mt-6 w-[calc(100%-40px)] border-ens-quartz-200 border-t lg:landscape:hidden" />
    </div>

    <div className="mt-[91px] flex flex-col gap-6 px-5 lg:landscape:mt-0 lg:landscape:flex-row lg:landscape:items-stretch lg:landscape:px-0">
      <SkeletonBlock
        className="hidden size-45.5 shrink-0 rounded-[18.889px] bg-ens-quartz-100 shadow-[0_4px_16px_rgba(0,0,0,0.12)] lg:landscape:block"
        isSolid
        shouldReduceMotion={shouldReduceMotion}
      />
      <div className="flex min-h-0 flex-1 rounded-none border-none bg-transparent p-0 shadow-none lg:landscape:min-h-45.5 lg:landscape:max-w-158.75 lg:landscape:rounded-xl lg:landscape:border-[0.25px] lg:landscape:border-ens-quartz-300 lg:landscape:bg-white lg:landscape:p-6 lg:landscape:shadow-[0_2px_6px_rgba(0,0,0,0.06)]">
        <div className="grid w-full gap-8 lg:landscape:grid-cols-[minmax(0,346.5px)_228px] lg:landscape:gap-3">
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
          <div className="grid min-w-0 grid-cols-3 gap-4 lg:landscape:flex lg:landscape:flex-col lg:landscape:justify-start lg:landscape:gap-1.5">
            {['timezone', 'language', 'location'].map((id, index) => (
              <div
                className="flex min-w-0 items-start gap-1 lg:landscape:items-center"
                key={id}
              >
                <SkeletonBlock
                  className="size-5 shrink-0 rounded lg:landscape:size-6"
                  shouldReduceMotion={shouldReduceMotion}
                />
                <SkeletonBlock
                  className={clsx(
                    'h-5',
                    index === 0 ? 'w-36' : index === 1 ? 'w-24' : 'w-28',
                  )}
                  shouldReduceMotion={shouldReduceMotion}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  </motion.div>
)
