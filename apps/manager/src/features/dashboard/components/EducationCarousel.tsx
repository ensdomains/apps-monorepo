import { Trans, useLingui } from '@lingui/react/macro'
import { CircleArrowLeft, CircleArrowRight } from 'lucide-react'
import { useReducedMotion } from 'motion/react'
import type { KeyboardEvent } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { FEATURE_CARDS } from '@/features/landing/FeaturesCarousel'
import { cn } from '@/lib/utils'

const SCROLL_TOLERANCE = 2

type CarouselState = {
  readonly canScrollNext: boolean
  readonly canScrollPrevious: boolean
  readonly endIndex: number
  readonly isScrollable: boolean
  readonly startIndex: number
}

const getInitialCarouselState = (cardCount: number): CarouselState => ({
  canScrollNext: cardCount > 1,
  canScrollPrevious: false,
  endIndex: 0,
  isScrollable: cardCount > 1,
  startIndex: 0,
})

const getCards = (carousel: HTMLElement) =>
  Array.from(carousel.children).filter(
    (element): element is HTMLElement => element instanceof HTMLElement,
  )

const getCardScrollLeft = (carousel: HTMLElement, card: HTMLElement) =>
  card.getBoundingClientRect().left -
  carousel.getBoundingClientRect().left +
  carousel.scrollLeft

const getCarouselState = (
  carousel: HTMLElement,
  cardCount: number,
): CarouselState => {
  const cards = getCards(carousel)
  if (carousel.clientWidth === 0 || cards.length === 0) {
    return getInitialCarouselState(cardCount)
  }

  const cardScrollPositions = cards.map((card) =>
    getCardScrollLeft(carousel, card),
  )
  const firstCardScrollLeft = cardScrollPositions[0] ?? 0
  const viewportStart = carousel.scrollLeft
  const viewportEnd = viewportStart + carousel.clientWidth
  const fullyVisibleIndexes = cards.flatMap((card, index) => {
    const cardStart = cardScrollPositions[index] ?? 0
    const cardEnd = cardStart + card.offsetWidth
    const isFullyVisible =
      cardStart >= viewportStart - SCROLL_TOLERANCE &&
      cardEnd <= viewportEnd + SCROLL_TOLERANCE

    return isFullyVisible ? [index] : []
  })

  const fallbackIndex = cardScrollPositions.reduce(
    (closestIndex, cardStart, index) => {
      const closestCardStart = cardScrollPositions[closestIndex] ?? 0

      return Math.abs(cardStart - viewportStart) <
        Math.abs(closestCardStart - viewportStart)
        ? index
        : closestIndex
    },
    0,
  )
  const startIndex = fullyVisibleIndexes.at(0) ?? fallbackIndex
  const endIndex = fullyVisibleIndexes.at(-1) ?? fallbackIndex
  const maxScrollLeft = Math.max(0, carousel.scrollWidth - carousel.clientWidth)

  return {
    canScrollNext: carousel.scrollLeft < maxScrollLeft - SCROLL_TOLERANCE,
    canScrollPrevious:
      carousel.scrollLeft > firstCardScrollLeft + SCROLL_TOLERANCE,
    endIndex,
    isScrollable: maxScrollLeft > SCROLL_TOLERANCE,
    startIndex,
  }
}

const isSameCarouselState = (a: CarouselState, b: CarouselState) =>
  a.canScrollNext === b.canScrollNext &&
  a.canScrollPrevious === b.canScrollPrevious &&
  a.endIndex === b.endIndex &&
  a.isScrollable === b.isScrollable &&
  a.startIndex === b.startIndex

const getVisibleRangeLabel = ({ endIndex, startIndex }: CarouselState) =>
  startIndex === endIndex
    ? `${startIndex + 1}`
    : `${startIndex + 1}\u2013${endIndex + 1}`

const useEducationCarousel = () => {
  const shouldReduceMotion = useReducedMotion() ?? false
  const carouselRef = useRef<HTMLElement>(null)
  const [carouselState, setCarouselState] = useState(() =>
    getInitialCarouselState(FEATURE_CARDS.length),
  )

  const updateCarouselState = useCallback(() => {
    const carousel = carouselRef.current
    if (!carousel) return

    const nextState = getCarouselState(carousel, FEATURE_CARDS.length)
    setCarouselState((currentState) =>
      isSameCarouselState(currentState, nextState) ? currentState : nextState,
    )
  }, [])

  useEffect(() => {
    const carousel = carouselRef.current
    if (!carousel) return

    updateCarouselState()
    const resizeObserver = new ResizeObserver(updateCarouselState)
    resizeObserver.observe(carousel)
    for (const card of getCards(carousel)) resizeObserver.observe(card)

    return () => resizeObserver.disconnect()
  }, [updateCarouselState])

  const scrollToIndex = useCallback(
    (index: number) => {
      const carousel = carouselRef.current
      if (!carousel) return

      const cards = getCards(carousel)
      const firstCard = cards[0]
      const targetCard = cards[index]
      if (!firstCard || !targetCard) return

      const maxScrollLeft = Math.max(
        0,
        carousel.scrollWidth - carousel.clientWidth,
      )
      const firstCardScrollLeft = getCardScrollLeft(carousel, firstCard)
      const targetScrollLeft = getCardScrollLeft(carousel, targetCard)
      carousel.scrollTo({
        behavior: shouldReduceMotion ? 'auto' : 'smooth',
        left: Math.max(
          firstCardScrollLeft,
          Math.min(targetScrollLeft, maxScrollLeft),
        ),
      })
    },
    [shouldReduceMotion],
  )

  const scrollByCard = useCallback(
    (direction: -1 | 1) => {
      const carousel = carouselRef.current
      if (!carousel) return

      const currentState = getCarouselState(carousel, FEATURE_CARDS.length)
      const canScroll =
        direction === 1
          ? currentState.canScrollNext
          : currentState.canScrollPrevious
      if (!canScroll) return

      const nextIndex = Math.max(
        0,
        Math.min(FEATURE_CARDS.length - 1, currentState.startIndex + direction),
      )
      scrollToIndex(nextIndex)
    },
    [scrollToIndex],
  )

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        scrollByCard(1)
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        scrollByCard(-1)
      }
    },
    [scrollByCard],
  )

  return {
    carouselRef,
    carouselState,
    handleKeyDown,
    scrollByCard,
    updateCarouselState,
  }
}

export const EducationCarousel = () => {
  const { t } = useLingui()
  const {
    carouselRef,
    carouselState,
    handleKeyDown,
    scrollByCard,
    updateCarouselState,
  } = useEducationCarousel()
  const totalPages = FEATURE_CARDS.length

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <div className="flex flex-col gap-3">
        <h2
          className="text-[28px] text-foreground leading-[0.96] tracking-[0.28px]"
          id="education-carousel-heading"
        >
          <Trans>Did You Know?</Trans>
        </h2>
        {carouselState.isScrollable ? (
          <div className="flex items-center gap-1">
            <button
              aria-controls="education-carousel-track"
              aria-label={t`Previous card`}
              className="flex size-11 items-center justify-center rounded-full text-ens-blue outline-none transition-[color,background-color,transform] duration-150 hover:bg-ens-blue/5 focus-visible:ring-2 focus-visible:ring-ens-blue focus-visible:ring-offset-2 active:scale-95 disabled:text-border disabled:active:scale-100 disabled:hover:bg-transparent"
              disabled={!carouselState.canScrollPrevious}
              onClick={() => scrollByCard(-1)}
              type="button"
            >
              <CircleArrowLeft className="size-8" strokeWidth={1} />
            </button>
            <span className="text-muted-foreground text-xs leading-[1.2] tracking-[0.12px]">
              <Trans>
                {getVisibleRangeLabel(carouselState)} of {totalPages}
              </Trans>
            </span>
            <button
              aria-controls="education-carousel-track"
              aria-label={t`Next card`}
              className="flex size-11 items-center justify-center rounded-full text-ens-blue outline-none transition-[color,background-color,transform] duration-150 hover:bg-ens-blue/5 focus-visible:ring-2 focus-visible:ring-ens-blue focus-visible:ring-offset-2 active:scale-95 disabled:text-border disabled:active:scale-100 disabled:hover:bg-transparent"
              disabled={!carouselState.canScrollNext}
              onClick={() => scrollByCard(1)}
              type="button"
            >
              <CircleArrowRight className="size-8" strokeWidth={1} />
            </button>
          </div>
        ) : null}
      </div>

      <section
        aria-labelledby="education-carousel-heading"
        className="-mx-4 flex min-w-0 snap-x snap-mandatory items-stretch gap-5 overflow-x-auto overscroll-x-contain scroll-smooth px-4 pb-1 outline-none [-webkit-overflow-scrolling:touch] [scrollbar-width:none] focus-visible:ring-2 focus-visible:ring-ens-blue focus-visible:ring-inset motion-reduce:scroll-auto md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden"
        id="education-carousel-track"
        onKeyDown={handleKeyDown}
        onScroll={updateCarouselState}
        ref={carouselRef}
        tabIndex={carouselState.isScrollable ? 0 : -1}
      >
        {FEATURE_CARDS.map((card, index) => (
          <article
            aria-labelledby={`education-card-title-${index}`}
            aria-posinset={index + 1}
            aria-setsize={FEATURE_CARDS.length}
            className={cn(
              // These bases create the approved one-, two-, and three-card density.
              'flex min-w-0 flex-none basis-5/6 snap-start flex-col gap-8 overflow-hidden rounded-md p-5 md:basis-[calc((100%-1.25rem)/2)] xl:basis-[calc((100%-2.5rem)/3)]',
              card.className,
            )}
            // biome-ignore lint/suspicious/noArrayIndexKey: Hardcoded list
            key={index}
          >
            <h3
              className="font-medium text-[25px] leading-[0.96] tracking-[-0.5px]"
              id={`education-card-title-${index}`}
            >
              {card.title}
            </h3>
            <p className="text-sm leading-none tracking-[-0.28px]">
              {card.description}
            </p>
            <div className="relative isolate mt-auto h-41 w-full overflow-hidden rounded-sm shadow-[0px_10px_14px_0px_rgba(14,61,104,0.06)]">
              <div
                className="relative h-80 origin-top-left scale-50 select-none"
                style={{ width: '200%' }}
              >
                {card.children}
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  )
}
