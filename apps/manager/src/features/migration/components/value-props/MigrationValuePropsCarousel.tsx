import { msg } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { motion, useReducedMotion } from 'motion/react'
import type { KeyboardEvent } from 'react'
import { useCallback, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { MigrationValuePropMediaCard } from './MigrationValuePropMediaCard'
import {
  MIGRATION_VALUE_PROP_SLIDES,
  type MigrationValuePropSlide,
} from './migrationValueProps'

const clampIndex = (index: number, length: number) =>
  Math.max(0, Math.min(index, length - 1))

const dragThreshold = 48
const swipeVelocityThreshold = 350

const getDesktopSlideState = (index: number, activeIndex: number) => {
  const offset = index - activeIndex
  const distance = Math.abs(offset)
  const isActive = offset === 0

  return {
    distance,
    isActive,
    isVisible: distance <= 1,
    offset,
  }
}

type DesktopSlideButtonProps = {
  readonly ariaLabel: string
  readonly index: number
  readonly isActive: boolean
  readonly label: string
  readonly media: MigrationValuePropSlide['media']
  readonly offset: number
  readonly onActivate: (index: number) => void
  readonly onDragEnd: (offsetX: number, velocityX: number) => void
  readonly onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
  readonly shouldReduceMotion: boolean
  readonly zIndex: number
}

const DesktopSlideButton = ({
  ariaLabel,
  index,
  isActive,
  label,
  media,
  offset,
  onActivate,
  onDragEnd,
  onKeyDown,
  shouldReduceMotion,
  zIndex,
}: DesktopSlideButtonProps) => (
  <motion.button
    animate={{
      filter: shouldReduceMotion
        ? 'blur(0px)'
        : isActive
          ? 'blur(0px)'
          : 'blur(4px)',
      opacity: isActive ? 1 : 0.5,
      scale: shouldReduceMotion ? 1 : isActive ? 1 : 0.92,
      x: offset * 88,
      zIndex,
    }}
    aria-label={ariaLabel}
    className="absolute top-0 left-1/2 flex w-[228px] -translate-x-1/2 flex-col items-center gap-4 rounded-[28px] pt-2 outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-ens-lapis-500 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
    drag={isActive && !shouldReduceMotion ? 'x' : false}
    dragConstraints={{ left: 0, right: 0 }}
    onClick={() => onActivate(index)}
    onDragEnd={(_, info) => onDragEnd(info.offset.x, info.velocity.x)}
    onKeyDown={onKeyDown}
    transition={
      shouldReduceMotion
        ? { duration: 0 }
        : {
            type: 'spring',
            stiffness: 260,
            damping: 28,
            mass: 0.9,
          }
    }
    type="button"
  >
    <MigrationValuePropMediaCard media={media} />
    <p className="font-semi-mono text-ens-garnet-500 text-xs uppercase leading-[1.2] tracking-[0.12px]">
      {label}
    </p>
  </motion.button>
)

export const MigrationValuePropsCarousel = () => {
  const { i18n, t } = useLingui()
  const shouldReduceMotion = useReducedMotion() ?? false
  const [activeIndex, setActiveIndex] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const resolveSlideAriaLabel = useCallback(
    (label: string) => i18n._(msg`Show ${label}`),
    [i18n],
  )
  const resolvedSlides = MIGRATION_VALUE_PROP_SLIDES.map((slide) => ({
    ...slide,
    ariaLabel: resolveSlideAriaLabel(i18n._(slide.label)),
    resolvedLabel: t(slide.label),
  }))

  const goToIndex = useCallback(
    (nextIndex: number) => {
      const clampedIndex = clampIndex(
        nextIndex,
        MIGRATION_VALUE_PROP_SLIDES.length,
      )
      setActiveIndex(clampedIndex)

      const el = scrollRef.current
      if (!el || el.offsetWidth === 0) return

      el.scrollTo({
        left: clampedIndex * el.offsetWidth,
        behavior: shouldReduceMotion ? 'auto' : 'smooth',
      })
    },
    [shouldReduceMotion],
  )

  const goToNext = useCallback(
    () => goToIndex(activeIndex + 1),
    [activeIndex, goToIndex],
  )

  const goToPrevious = useCallback(
    () => goToIndex(activeIndex - 1),
    [activeIndex, goToIndex],
  )

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el || el.offsetWidth === 0) return

    const nextIndex = Math.round(el.scrollLeft / el.offsetWidth)
    setActiveIndex(clampIndex(nextIndex, MIGRATION_VALUE_PROP_SLIDES.length))
  }, [])

  const handleDesktopDragEnd = useCallback(
    (offsetX: number, velocityX: number) => {
      if (offsetX <= -dragThreshold || velocityX <= -swipeVelocityThreshold) {
        goToNext()
        return
      }

      if (offsetX >= dragThreshold || velocityX >= swipeVelocityThreshold) {
        goToPrevious()
      }
    },
    [goToNext, goToPrevious],
  )

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        goToNext()
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        goToPrevious()
      }
    },
    [goToNext, goToPrevious],
  )

  return (
    <section aria-label={t`Migration value propositions`} className="w-full">
      <div className="mb-2 flex items-center justify-center gap-0.5">
        {resolvedSlides.map((slide, index) => (
          <button
            aria-current={index === activeIndex ? 'true' : undefined}
            aria-label={slide.ariaLabel}
            className={cn(
              'rounded-full outline-none transition-all focus-visible:ring-2 focus-visible:ring-ens-lapis-500 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
              index === activeIndex
                ? 'h-1.5 w-[19px] bg-ens-garnet-500'
                : 'h-1.5 w-[7px] bg-ens-garnet-500/50',
            )}
            key={slide.id}
            onClick={() => goToIndex(index)}
            onKeyDown={handleKeyDown}
            type="button"
          />
        ))}
      </div>

      <div className="w-full md:hidden">
        <div
          className="flex snap-x snap-mandatory overflow-x-auto [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          onScroll={handleScroll}
          ref={scrollRef}
        >
          {resolvedSlides.map((slide) => (
            <div
              className="flex w-full shrink-0 snap-center flex-col items-center gap-4 px-5"
              key={slide.id}
            >
              <MigrationValuePropMediaCard
                className="max-w-[376px]"
                media={slide.media}
              />
              <p className="font-semi-mono text-ens-garnet-500 text-xs uppercase leading-[1.2] tracking-[0.12px]">
                {slide.resolvedLabel}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="relative hidden min-h-[24rem] w-full overflow-hidden md:block">
        {resolvedSlides
          .map((slide, index) => ({
            index,
            slide,
            state: getDesktopSlideState(index, activeIndex),
          }))
          .filter(({ state }) => state.isVisible)
          .map(({ index, slide, state }) => {
            const { distance, isActive, offset } = state

            return (
              <DesktopSlideButton
                ariaLabel={slide.ariaLabel}
                index={index}
                isActive={isActive}
                key={slide.id}
                label={slide.resolvedLabel}
                media={slide.media}
                offset={offset}
                onActivate={goToIndex}
                onDragEnd={handleDesktopDragEnd}
                onKeyDown={handleKeyDown}
                shouldReduceMotion={shouldReduceMotion}
                zIndex={resolvedSlides.length - distance}
              />
            )
          })}
      </div>
    </section>
  )
}
