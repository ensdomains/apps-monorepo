import { ChevronLeft, ChevronRight } from 'lucide-react'
import { motion } from 'motion/react'
import { useRef, useState } from 'react'

interface CarouselCard {
  id: number
  variant: 'green' | 'pink'
}

const CARDS: CarouselCard[] = Array.from({ length: 10 }).map((_, i) => ({
  id: i,
  variant: i % 2 === 0 ? ('green' as const) : ('pink' as const),
}))

const GreenCardMockup = () => (
  <div className="h-[164px] w-full rounded-[3.906px] bg-[#007c23]/10" />
)

const PinkCardMockup = () => (
  <div className="h-[164px] w-full rounded-[3.906px] bg-[#f53293]/10" />
)

export const DidYouKnowSection = () => {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(true)

  const checkScrollability = () => {
    const container = scrollContainerRef.current
    if (!container) return

    setCanScrollLeft(container.scrollLeft > 0)
    setCanScrollRight(
      container.scrollLeft < container.scrollWidth - container.clientWidth - 10,
    )
  }

  const scroll = (direction: 'left' | 'right') => {
    const container = scrollContainerRef.current
    if (!container) return

    const scrollAmount = 460 // Card width (428) + gap (20) + some extra
    const targetScroll =
      direction === 'left'
        ? container.scrollLeft - scrollAmount
        : container.scrollLeft + scrollAmount

    container.addEventListener('scrollend', checkScrollability, { once: true })
    container.scrollTo({
      left: targetScroll,
      behavior: 'smooth',
    })
  }

  return (
    <div className="overflow-hidden rounded-[8px] border-[#dededf] border-[0.25px] bg-[#fcfbfb] px-4 py-6 md:px-[24px] md:py-[32px]">
      <div className="mb-6 flex flex-col gap-3">
        <h2 className="font-serif text-[#232222] text-[24px] leading-[0.96] tracking-[0.24px] md:text-[28px] md:tracking-[0.28px]">
          Did You Know?
        </h2>

        <div className="flex items-center gap-[8px]">
          <button
            aria-label="Previous card"
            className="relative size-[32px] shrink-0 rounded-full border border-[#dededf] transition-colors hover:bg-[#f0f0f0] disabled:opacity-30"
            disabled={!canScrollLeft}
            onClick={() => scroll('left')}
            type="button"
          >
            <ChevronLeft className="size-full p-1 text-[#232222]" />
          </button>
          <button
            aria-label="Next card"
            className="relative size-[32px] shrink-0 rounded-full border border-[#dededf] transition-colors hover:bg-[#f0f0f0] disabled:opacity-30"
            disabled={!canScrollRight}
            onClick={() => scroll('right')}
            type="button"
          >
            <ChevronRight className="size-full p-1 text-[#232222]" />
          </button>
        </div>
      </div>

      <motion.div
        aria-label="Did you know carousel"
        className="scrollbar-hide flex gap-[20px] overflow-x-auto"
        onScroll={checkScrollability}
        ref={scrollContainerRef}
        role="region"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        {CARDS.map((card) => (
          <motion.div
            className={`flex w-full shrink-0 flex-col gap-[32px] overflow-hidden rounded-[6px] p-4 md:w-[428px] md:p-[20px] ${
              card.variant === 'green' ? 'bg-[#c5ddcc]' : ''
            }`}
            initial={{ opacity: 0, x: 20 }}
            key={card.id}
            style={
              card.variant === 'pink'
                ? {
                    background:
                      'linear-gradient(174.92deg, rgb(255, 213, 233) 4.8038%, rgb(254, 206, 226) 100.79%)',
                  }
                : undefined
            }
            transition={{ duration: 0.3, delay: card.id * 0.05 }}
            viewport={{ once: true }}
            whileInView={{ opacity: 1, x: 0 }}
          >
            {card.variant === 'green' ? (
              <>
                <div className="text-[#007c23]">
                  <p className="font-medium font-sans text-[20px] leading-[0.96] tracking-[-0.4px] md:text-[24.889px] md:tracking-[-0.4978px]">
                    One username{' '}
                    <span className="font-normal font-serif italic">
                      everywhere.
                    </span>
                  </p>
                </div>
                <p className="font-serif text-[#007c23] text-[13px] leading-none tracking-[-0.26px] md:text-[14px] md:tracking-[-0.28px]">
                  Your name lives onchain — you own it, not a platform. Sign in
                  to web3 apps with your{' '}
                  <span className="font-medium font-sans">.eth name</span> and
                  your ENS profile will load automatically.
                </p>
                <GreenCardMockup />
              </>
            ) : (
              <>
                <div className="text-[#f53293]">
                  <p className="font-medium font-sans text-[20px] leading-[0.96] tracking-[-0.4px] md:text-[24.889px] md:tracking-[-0.4978px]">
                    Verify{' '}
                    <span className="font-normal font-serif italic">
                      authenticity
                    </span>{' '}
                    and stay safe.
                  </p>
                </div>
                <p className="font-serif text-[#f53293] text-[13px] leading-none tracking-[-0.26px] md:text-[14px] md:tracking-[-0.28px]">
                  Companies and projects use ENS because it&apos;s secured with
                  ethereum, so you can be sure it&apos;s the real deal. Avoid
                  impersonation scams and stay safe out there &lt;3.
                </p>
                <PinkCardMockup />
              </>
            )}
          </motion.div>
        ))}
      </motion.div>
    </div>
  )
}
