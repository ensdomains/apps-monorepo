import { act, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@/utils/test-utils'
import { EducationCarousel } from './EducationCarousel'

const motionMock = vi.hoisted(() => ({
  shouldReduceMotion: false,
}))

vi.mock('motion/react', () => ({
  useReducedMotion: () => motionMock.shouldReduceMotion,
}))

let resizeObserverCallback: ResizeObserverCallback | undefined

class ResizeObserverMock {
  constructor(callback: ResizeObserverCallback) {
    resizeObserverCallback = callback
  }

  disconnect = vi.fn()
  observe = vi.fn()
}

const setElementMetric = (
  element: HTMLElement,
  property:
    | 'clientWidth'
    | 'offsetLeft'
    | 'offsetWidth'
    | 'scrollLeft'
    | 'scrollWidth',
  value: number,
  writable = false,
) => {
  Object.defineProperty(element, property, {
    configurable: true,
    value,
    writable,
  })
}

const triggerResize = () => {
  act(() => resizeObserverCallback?.([], {} as ResizeObserver))
}

const setupCarouselLayout = ({
  cardWidth,
  clientWidth,
  gap,
  trailingSpace = 0,
}: {
  readonly cardWidth: number
  readonly clientWidth: number
  readonly gap: number
  readonly trailingSpace?: number
}) => {
  const carousel = screen.getByRole('region', { name: 'Did You Know?' })
  const track = carousel.firstElementChild
  if (!(track instanceof HTMLElement)) {
    throw new Error('Education carousel track was not rendered')
  }

  const cards = Array.from(track.querySelectorAll<HTMLElement>('article'))
  const scrollWidth =
    cards.length * cardWidth + (cards.length - 1) * gap + trailingSpace
  const maxScrollLeft = Math.max(0, scrollWidth - clientWidth)

  setElementMetric(carousel, 'clientWidth', clientWidth)
  setElementMetric(carousel, 'scrollLeft', 0, true)
  setElementMetric(carousel, 'scrollWidth', scrollWidth)

  for (const [index, card] of cards.entries()) {
    setElementMetric(card, 'offsetLeft', index * (cardWidth + gap))
    setElementMetric(card, 'offsetWidth', cardWidth)
  }

  const trailingElement = track.lastElementChild
  if (
    trailingElement instanceof HTMLElement &&
    !trailingElement.matches('article')
  ) {
    setElementMetric(trailingElement, 'offsetWidth', trailingSpace)
  }

  const scrollBy = vi.fn((options: ScrollToOptions) => {
    carousel.scrollLeft = Math.max(
      0,
      Math.min(maxScrollLeft, carousel.scrollLeft + (options.left ?? 0)),
    )
  })
  Object.defineProperty(carousel, 'scrollBy', {
    configurable: true,
    value: scrollBy,
  })

  triggerResize()

  return { carousel, scrollBy }
}

describe('EducationCarousel', () => {
  beforeEach(() => {
    motionMock.shouldReduceMotion = false
    resizeObserverCallback = undefined
    vi.clearAllMocks()
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('contains the scroll rail overflow at the component boundary', () => {
    render(<EducationCarousel />)
    const heading = screen.getByRole('heading', { name: 'Did You Know?' })
    const carouselRoot = heading.parentElement?.parentElement

    expect(carouselRoot).toHaveClass('overflow-x-clip', '[contain:inline-size]')
  })

  it('renders every card and hides controls when all cards fit', () => {
    render(<EducationCarousel />)
    const { carousel } = setupCarouselLayout({
      cardWidth: 480,
      clientWidth: 1480,
      gap: 20,
    })

    expect(within(carousel).getAllByRole('article')).toHaveLength(3)
    expect(screen.getByText('One username everywhere')).toBeInTheDocument()
    expect(
      screen.getByText('Verify authenticity and stay safe.'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /A simpler way to get paid/ }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Next card' }),
    ).not.toBeInTheDocument()
    expect(carousel).toHaveAttribute('tabindex', '-1')
  })

  it('scrolls by one card and clamps the final arrow movement', () => {
    render(<EducationCarousel />)
    const { carousel, scrollBy } = setupCarouselLayout({
      cardWidth: 480,
      clientWidth: 600,
      gap: 20,
      trailingSpace: 16,
    })
    const previousButton = screen.getByRole('button', {
      name: 'Previous card',
    })
    const nextButton = screen.getByRole('button', { name: 'Next card' })

    expect(previousButton).toBeDisabled()
    expect(nextButton).toBeEnabled()

    fireEvent.click(nextButton)
    expect(scrollBy).toHaveBeenLastCalledWith({
      behavior: 'smooth',
      left: 500,
    })
    fireEvent.scroll(carousel)

    expect(previousButton).toBeEnabled()
    expect(nextButton).toBeEnabled()

    fireEvent.click(nextButton)
    expect(scrollBy).toHaveBeenLastCalledWith({
      behavior: 'smooth',
      left: 396,
    })
    fireEvent.scroll(carousel)

    expect(carousel.scrollLeft).toBe(896)
    expect(previousButton).toBeEnabled()
    expect(nextButton).toBeDisabled()
  })

  it('keeps a manually selected free-scroll position', () => {
    render(<EducationCarousel />)
    const { carousel, scrollBy } = setupCarouselLayout({
      cardWidth: 480,
      clientWidth: 600,
      gap: 20,
      trailingSpace: 16,
    })

    carousel.scrollLeft = 137
    fireEvent.scroll(carousel)

    expect(scrollBy).not.toHaveBeenCalled()
    expect(carousel.scrollLeft).toBe(137)
    expect(screen.getByRole('button', { name: 'Previous card' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Next card' })).toBeEnabled()
  })

  it('includes the trailing space in the final tablet arrow movement', () => {
    render(<EducationCarousel />)
    const { carousel, scrollBy } = setupCarouselLayout({
      cardWidth: 490,
      clientWidth: 1000,
      gap: 20,
      trailingSpace: 24,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Next card' }))
    expect(scrollBy).toHaveBeenLastCalledWith({
      behavior: 'smooth',
      left: 534,
    })
    fireEvent.scroll(carousel)

    expect(carousel.scrollLeft).toBe(534)
    expect(screen.getByRole('button', { name: 'Next card' })).toBeDisabled()
  })

  it('supports Left and Right keyboard navigation', () => {
    render(<EducationCarousel />)
    const { carousel, scrollBy } = setupCarouselLayout({
      cardWidth: 480,
      clientWidth: 600,
      gap: 20,
      trailingSpace: 16,
    })

    expect(carousel).toHaveAttribute('tabindex', '0')

    fireEvent.keyDown(carousel, { key: 'ArrowRight' })
    expect(scrollBy).toHaveBeenLastCalledWith({
      behavior: 'smooth',
      left: 500,
    })

    fireEvent.scroll(carousel)
    fireEvent.keyDown(carousel, { key: 'ArrowLeft' })
    expect(scrollBy).toHaveBeenLastCalledWith({
      behavior: 'smooth',
      left: -500,
    })
  })

  it('uses immediate arrow movement when reduced motion is enabled', () => {
    motionMock.shouldReduceMotion = true
    render(<EducationCarousel />)
    const { scrollBy } = setupCarouselLayout({
      cardWidth: 480,
      clientWidth: 600,
      gap: 20,
      trailingSpace: 16,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Next card' }))

    expect(scrollBy).toHaveBeenLastCalledWith({
      behavior: 'auto',
      left: 500,
    })
  })
})
