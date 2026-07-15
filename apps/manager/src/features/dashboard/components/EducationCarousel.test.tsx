import { act, fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
  disconnect = vi.fn()
  observe = vi.fn()
  unobserve = vi.fn()

  constructor(callback: ResizeObserverCallback) {
    resizeObserverCallback = callback
  }
}

const setElementMetric = (
  element: HTMLElement,
  property: string,
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
  const callback = resizeObserverCallback
  if (!callback) throw new Error('ResizeObserver was not initialized')

  act(() => callback([], {} as ResizeObserver))
}

const setupCarouselLayout = ({
  cardWidth,
  clientWidth,
  gap,
  inset = 0,
}: {
  readonly cardWidth: number
  readonly clientWidth: number
  readonly gap: number
  readonly inset?: number
}) => {
  const carousel = screen.getByRole('region', { name: 'Did You Know?' })
  const cards = within(carousel).getAllByRole('article')
  const scrollWidth =
    inset * 2 + cards.length * cardWidth + (cards.length - 1) * gap

  setElementMetric(carousel, 'clientWidth', clientWidth)
  setElementMetric(carousel, 'scrollWidth', scrollWidth)
  setElementMetric(carousel, 'scrollLeft', inset, true)
  Object.defineProperty(carousel, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      bottom: 0,
      height: 0,
      left: 0,
      right: clientWidth,
      top: 0,
      width: clientWidth,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  })

  cards.forEach((card, index) => {
    setElementMetric(card, 'offsetWidth', cardWidth)
    Object.defineProperty(card, 'getBoundingClientRect', {
      configurable: true,
      value: () => {
        const left = inset + index * (cardWidth + gap) - carousel.scrollLeft

        return {
          bottom: 0,
          height: 0,
          left,
          right: left + cardWidth,
          top: 0,
          width: cardWidth,
          x: left,
          y: 0,
          toJSON: () => ({}),
        }
      },
    })
  })

  const scrollTo = vi.fn((options: ScrollToOptions) => {
    carousel.scrollLeft = options.left ?? carousel.scrollLeft
  })
  Object.defineProperty(carousel, 'scrollTo', {
    configurable: true,
    value: scrollTo,
  })

  triggerResize()

  return { carousel, scrollTo }
}

describe('EducationCarousel', () => {
  beforeEach(() => {
    motionMock.shouldReduceMotion = false
    resizeObserverCallback = undefined
    vi.clearAllMocks()
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  })

  it('renders every card and hides navigation when all cards fit', () => {
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

  it('shows two-card ranges and advances by one card on medium widths', () => {
    render(<EducationCarousel />)
    const { carousel, scrollTo } = setupCarouselLayout({
      cardWidth: 490,
      clientWidth: 1000,
      gap: 20,
    })
    const previousButton = screen.getByRole('button', {
      name: 'Previous card',
    })
    const nextButton = screen.getByRole('button', { name: 'Next card' })

    expect(screen.getByText('1\u20132 of 3')).toBeInTheDocument()
    expect(previousButton).toBeDisabled()
    expect(nextButton).toBeEnabled()

    fireEvent.click(nextButton)
    expect(scrollTo).toHaveBeenLastCalledWith({
      behavior: 'smooth',
      left: 510,
    })
    fireEvent.scroll(carousel)

    expect(screen.getByText('2\u20133 of 3')).toBeInTheDocument()
    expect(previousButton).toBeEnabled()
    expect(nextButton).toBeDisabled()

    fireEvent.click(previousButton)
    expect(scrollTo).toHaveBeenLastCalledWith({
      behavior: 'smooth',
      left: 0,
    })
  })

  it('supports keyboard navigation through the single-card mobile layout', () => {
    render(<EducationCarousel />)
    const { carousel, scrollTo } = setupCarouselLayout({
      cardWidth: 480,
      clientWidth: 600,
      gap: 20,
      inset: 16,
    })

    expect(screen.getByText('1 of 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous card' })).toBeDisabled()

    fireEvent.keyDown(carousel, { key: 'ArrowRight' })
    expect(scrollTo).toHaveBeenLastCalledWith({
      behavior: 'smooth',
      left: 516,
    })
    fireEvent.scroll(carousel)
    expect(screen.getByText('2 of 3')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Next card' }))
    expect(scrollTo).toHaveBeenLastCalledWith({
      behavior: 'smooth',
      left: 912,
    })
    fireEvent.scroll(carousel)

    expect(screen.getByText('3 of 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next card' })).toBeDisabled()

    fireEvent.keyDown(carousel, { key: 'ArrowLeft' })
    expect(scrollTo).toHaveBeenLastCalledWith({
      behavior: 'smooth',
      left: 516,
    })
    fireEvent.scroll(carousel)
    expect(screen.getByText('2 of 3')).toBeInTheDocument()
  })

  it('uses immediate scrolling when reduced motion is enabled', () => {
    motionMock.shouldReduceMotion = true
    render(<EducationCarousel />)
    const { scrollTo } = setupCarouselLayout({
      cardWidth: 480,
      clientWidth: 600,
      gap: 20,
      inset: 16,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Next card' }))

    expect(scrollTo).toHaveBeenLastCalledWith({
      behavior: 'auto',
      left: 516,
    })
  })
})
