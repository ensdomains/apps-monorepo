import clsx from 'clsx'
import { motion } from 'motion/react'

type SkeletonBlockProps = {
  readonly className?: string
  readonly isSolid?: boolean
  readonly shouldReduceMotion: boolean
}

type ProfileViewNewSectionLoadingProps = {
  readonly children: React.ReactNode
  readonly className?: string
  readonly index: number
  readonly shouldReduceMotion: boolean
  readonly titleWidth: string
}

const easing = [0.25, 0.46, 0.45, 0.94] as const

export const loadingCardSurfaceClassName =
  'rounded-[14px] border-[0.692px] border-[rgba(199,198,196,0.25)] bg-white shadow-[0_2px_6px_rgba(0,0,0,0.06)] lg:landscape:rounded-xl lg:landscape:border-[0.25px] lg:landscape:border-ens-quartz-300'

export const getMotionProps = (shouldReduceMotion: boolean, delay = 0) =>
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

export const SkeletonBlock = ({
  className,
  isSolid = false,
  shouldReduceMotion,
}: SkeletonBlockProps) => (
  <div
    className={clsx(
      'relative overflow-hidden rounded-md',
      isSolid ? 'bg-ens-quartz-200' : 'bg-ens-quartz-200/75',
      !shouldReduceMotion && 'animate-pulse',
      className,
    )}
  />
)

export const ProfileViewNewSectionLoading = ({
  children,
  className = '',
  index,
  shouldReduceMotion,
  titleWidth,
}: ProfileViewNewSectionLoadingProps) => (
  <motion.section
    className={clsx(
      'border-[0.25px] border-transparent bg-transparent px-5 py-6 shadow-none lg:landscape:px-8 lg:landscape:pt-8 lg:landscape:pb-6',
      className,
    )}
    {...getMotionProps(shouldReduceMotion, index * 0.05)}
  >
    <SkeletonBlock
      className={clsx('h-5', titleWidth)}
      shouldReduceMotion={shouldReduceMotion}
    />
    <div className="mt-6">{children}</div>
  </motion.section>
)
