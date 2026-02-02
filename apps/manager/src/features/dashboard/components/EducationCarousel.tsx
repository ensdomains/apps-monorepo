import { CircleArrowLeft, CircleArrowRight } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { tw } from '@/utils/tailwind'

const CAROUSEL_GAP = 20

type EducationCardData = {
  readonly title: ReactNode
  readonly description: ReactNode
  readonly textColorClass: string
  readonly cardClassName: string
  readonly placeholderClass: string
}

const EDUCATION_CARDS: EducationCardData[] = [
  {
    textColorClass: tw`text-ens-peridot-core`,
    cardClassName: tw`bg-ens-peridot-dust`,
    placeholderClass: tw`bg-ens-peridot-surface/20`,
    title: (
      <>
        One username
        <br />
        <span className="font-normal font-serif italic">everywhere.</span>
      </>
    ),
    description: (
      <>
        Your name lives onchain — you own it, not a platform. Sign in to web3
        apps with your <span className="font-medium font-sans">.eth name</span>{' '}
        and your ENS profile will load automatically.
      </>
    ),
  },
  {
    textColorClass: tw`text-ens-garnet-core`,
    cardClassName: tw`from-[#ffd5e9] from-5% to-[#fecee2] bg-linear-175`,
    placeholderClass: tw`bg-ens-garnet-surface/20`,
    title: (
      <>
        Verify{' '}
        <span className="font-normal font-serif italic">authenticity</span>
        <br />
        and stay safe.
      </>
    ),
    description: (
      <>
        Companies and projects use ENS because it&apos;s secured with ethereum,
        so you can be sure it&apos;s the real deal. Avoid impersonation scams
        and stay safe out there &lt;3.
      </>
    ),
  },
  {
    textColorClass: tw`text-ens-lapis-core`,
    cardClassName: tw`bg-ens-lapis-dust`,
    placeholderClass: tw`bg-ens-lapis-surface/20`,
    title: (
      <>
        A simpler way to
        <br />
        <span className="font-normal font-serif italic">get paid.</span>
      </>
    ),
    description: (
      <>
        Your ENS name replaces your wallet addresses so friends and clients can
        send money to <span className="font-medium font-sans">friend.eth</span>{' '}
        instead of a confusing jumble of letters and numbers.
      </>
    ),
  },
]

export const EducationCarousel = () => {
  const shouldReduceMotion = useReducedMotion()
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [currentIndex, setCurrentIndex] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width !== undefined) setContainerWidth(width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const cardsPerView = containerWidth > 0 && containerWidth < 640 ? 1 : 2
  const maxIndex = Math.max(0, EDUCATION_CARDS.length - cardsPerView)
  const cardWidth =
    containerWidth > 0
      ? (containerWidth - CAROUSEL_GAP * (cardsPerView - 1)) / cardsPerView
      : 0
  const offset = -currentIndex * (cardWidth + CAROUSEL_GAP)

  const handlePrev = useCallback(() => {
    setCurrentIndex((i) => Math.max(0, i - 1))
  }, [])

  const handleNext = useCallback(() => {
    setCurrentIndex((i) => Math.min(maxIndex, i + 1))
  }, [maxIndex])

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <h2 className="font-serif text-[28px] text-foreground leading-[0.96] tracking-[0.28px]">
          Did You Know?
        </h2>
        <div className="flex items-center gap-2">
          <button
            aria-label="Previous"
            className="flex size-8 items-center justify-center text-ens-gray-three disabled:text-border"
            disabled={currentIndex === 0}
            onClick={handlePrev}
            type="button"
          >
            <CircleArrowLeft className="size-8" strokeWidth={1} />
          </button>
          <span className="font-sans text-muted-foreground text-sm leading-[1.2] tracking-[0.14px]">
            {currentIndex + 1} of {maxIndex + 1}
          </span>
          <button
            aria-label="Next"
            className="flex size-8 items-center justify-center text-ens-blue disabled:text-border"
            disabled={currentIndex >= maxIndex}
            onClick={handleNext}
            type="button"
          >
            <CircleArrowRight className="size-8" strokeWidth={1} />
          </button>
        </div>
      </div>

      <div className="overflow-hidden" ref={containerRef}>
        {containerWidth > 0 && (
          <motion.div
            animate={{ x: offset }}
            className="flex"
            initial={false}
            style={{ gap: CAROUSEL_GAP }}
            transition={
              shouldReduceMotion
                ? { duration: 0 }
                : {
                    duration: 0.3,
                    ease: [0.25, 0.46, 0.45, 0.94],
                  }
            }
          >
            {EDUCATION_CARDS.map((card, index) => (
              <div
                className="shrink-0"
                // biome-ignore lint/suspicious/noArrayIndexKey: Static card list
                key={index}
                style={{ width: cardWidth }}
              >
                <div
                  className={cn(
                    'flex h-full flex-col gap-8 overflow-hidden rounded-[6px] p-5',
                    card.textColorClass,
                    card.cardClassName,
                  )}
                >
                  <h3 className="font-medium font-sans text-[25px] leading-[0.96] tracking-[-0.5px]">
                    {card.title}
                  </h3>
                  <p className="font-serif text-sm leading-none tracking-[-0.28px]">
                    {card.description}
                  </p>
                  <div
                    className={cn(
                      'h-[164px] w-full rounded-sm',
                      card.placeholderClass,
                    )}
                  />
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </div>
    </div>
  )
}
