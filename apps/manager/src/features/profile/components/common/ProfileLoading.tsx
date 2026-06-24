import { motion, useReducedMotion } from 'motion/react'
import { tw } from '@/utils/tailwind'

interface SkeletonLine {
  id: string
  width: string
}

interface SkeletonCardLayout {
  id: string
  titleWidth: string
  lines: SkeletonLine[]
}

interface SkeletonLayout {
  left: SkeletonCardLayout[]
  right: SkeletonCardLayout[]
}

const layout: SkeletonLayout = {
  left: [
    {
      id: 'view-bio',
      titleWidth: 'w-16',
      lines: [
        { id: 'view-bio-line-1', width: 'w-full' },
        { id: 'view-bio-line-2', width: 'w-5/6' },
        { id: 'view-bio-line-3', width: 'w-2/3' },
      ],
    },
    {
      id: 'view-connect',
      titleWidth: 'w-24',
      lines: [
        { id: 'view-connect-line-1', width: 'w-full' },
        { id: 'view-connect-line-2', width: 'w-4/5' },
      ],
    },
    {
      id: 'view-other',
      titleWidth: 'w-20',
      lines: [
        { id: 'view-other-line-1', width: 'w-full' },
        { id: 'view-other-line-2', width: 'w-3/4' },
      ],
    },
  ],
  right: [
    {
      id: 'view-wallets',
      titleWidth: 'w-32',
      lines: [
        { id: 'view-wallets-line-1', width: 'w-full' },
        { id: 'view-wallets-line-2', width: 'w-2/3' },
      ],
    },
    {
      id: 'view-links',
      titleWidth: 'w-14',
      lines: [
        { id: 'view-links-line-1', width: 'w-full' },
        { id: 'view-links-line-2', width: 'w-full' },
      ],
    },
  ],
}

const easing = [0.25, 0.46, 0.45, 0.94] as const

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

interface SkeletonBlockProps {
  className?: string
  isSolid?: boolean
  shouldReduceMotion: boolean
}

const SkeletonBlock = ({
  className,
  isSolid = false,
  shouldReduceMotion,
}: SkeletonBlockProps) => {
  return (
    <div
      className={tw(
        'relative overflow-hidden rounded-md',
        isSolid ? 'bg-gray-200' : 'bg-gray-200/80',
        className,
      )}
    >
      {!shouldReduceMotion && (
        <div className="pointer-events-none absolute inset-0 animate-shimmer bg-linear-to-r from-transparent via-white/20 to-transparent" />
      )}
    </div>
  )
}

const HeaderSkeleton = ({
  shouldReduceMotion,
}: {
  shouldReduceMotion: boolean
}) => {
  return (
    <motion.div
      className="overflow-hidden rounded-xl border-[0.25px] border-border bg-white shadow-none"
      {...getMotionProps(shouldReduceMotion)}
    >
      <div className="relative w-full">
        <div className="relative aspect-3/1 w-full overflow-hidden md:aspect-5/1">
          <div className="absolute inset-0 bg-linear-to-br from-[#eef2f7] via-[#e8edf4] to-[#eef2f7]" />
          {!shouldReduceMotion && (
            <div className="pointer-events-none absolute inset-0 animate-shimmer bg-linear-to-r from-transparent via-white/20 to-transparent" />
          )}
          <div className="absolute top-4 right-4 flex items-center gap-2">
            <SkeletonBlock
              className="size-9 rounded-full border border-white/70 bg-white/50"
              shouldReduceMotion={shouldReduceMotion}
            />
            <SkeletonBlock
              className="h-9 w-20 rounded-md border border-white/70 bg-white/50"
              shouldReduceMotion={shouldReduceMotion}
            />
          </div>
        </div>

        <div className="absolute -bottom-10 left-1/2 size-24 -translate-x-1/2 md:size-36 lg:size-40">
          <SkeletonBlock
            className="size-full rounded-xl bg-gray-200 ring-2 ring-white"
            isSolid
            shouldReduceMotion={shouldReduceMotion}
          />
        </div>
      </div>

      <div className="flex w-full flex-col items-start gap-3 bg-white px-4 pt-16 pb-4 md:px-6 md:pt-16 md:pb-6">
        <SkeletonBlock
          className="h-9 w-45 rounded-sm md:h-12 md:w-[220px]"
          shouldReduceMotion={shouldReduceMotion}
        />
        <SkeletonBlock
          className="h-5 w-27.5 rounded-full"
          shouldReduceMotion={shouldReduceMotion}
        />
        <SkeletonBlock
          className="mt-1 h-4 w-52.5"
          shouldReduceMotion={shouldReduceMotion}
        />
        <SkeletonBlock
          className="h-4 w-43.75"
          shouldReduceMotion={shouldReduceMotion}
        />
        <SkeletonBlock
          className="h-4 w-41.25"
          shouldReduceMotion={shouldReduceMotion}
        />
      </div>
    </motion.div>
  )
}

const SkeletonCard = ({
  index,
  layout,
  shouldReduceMotion,
}: {
  index: number
  layout: SkeletonCardLayout
  shouldReduceMotion: boolean
}) => {
  return (
    <motion.div
      className="rounded-xl border-[0.25px] border-border bg-white p-5 shadow-none"
      {...getMotionProps(shouldReduceMotion, index * 0.05)}
    >
      <SkeletonBlock
        className={tw('mb-4 h-5', layout.titleWidth)}
        shouldReduceMotion={shouldReduceMotion}
      />
      <div className="space-y-3">
        {layout.lines.map((line) => (
          <SkeletonBlock
            className={tw('h-4', line.width)}
            key={line.id}
            shouldReduceMotion={shouldReduceMotion}
          />
        ))}
      </div>
    </motion.div>
  )
}

export const ProfileLoading = () => {
  const shouldReduceMotion = useReducedMotion() ?? false

  return (
    <div className="mx-auto mb-12 w-full max-w-7xl space-y-4 pt-4 md:w-[calc(100%-4rem)]">
      <HeaderSkeleton shouldReduceMotion={shouldReduceMotion} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
        <div className="space-y-4 md:col-span-7 lg:col-span-8">
          {layout.left.map((card, index) => (
            <SkeletonCard
              index={index + 1}
              key={card.id}
              layout={card}
              shouldReduceMotion={shouldReduceMotion}
            />
          ))}
        </div>
        <div className="space-y-4 md:col-span-5 lg:col-span-4">
          {layout.right.map((card, index) => (
            <SkeletonCard
              index={layout.left.length + index + 1}
              key={card.id}
              layout={card}
              shouldReduceMotion={shouldReduceMotion}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
