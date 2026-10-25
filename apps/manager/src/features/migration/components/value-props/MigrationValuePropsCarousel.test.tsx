import '@testing-library/jest-dom'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MigrationValuePropsCarousel } from './MigrationValuePropsCarousel'
import { AUTOPLAY_INTERVAL_MS } from './useCarouselAutoplay'

i18n.loadAndActivate({ locale: 'en', messages: {} })

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const renderCarousel = () =>
  render(
    <I18nProvider i18n={i18n}>
      <MigrationValuePropsCarousel isNftSlideVisible={false} />
    </I18nProvider>,
  )

const activeSlide = () =>
  document.querySelector('[aria-current="true"]')?.getAttribute('aria-label')

const waitOneInterval = () =>
  act(() => {
    vi.advanceTimersByTime(AUTOPLAY_INTERVAL_MS)
  })

describe('MigrationValuePropsCarousel autoplay', () => {
  it.each([
    {
      case: 'the pointer leaves while a slide button keeps focus',
      enter: (carousel: HTMLElement, button: HTMLElement) => {
        fireEvent.pointerEnter(carousel)
        fireEvent.focus(button)
      },
      leaveOne: (carousel: HTMLElement) => fireEvent.pointerLeave(carousel),
      leaveOther: (_: HTMLElement, button: HTMLElement) =>
        fireEvent.blur(button, { relatedTarget: null }),
    },
    {
      case: 'focus leaves while the pointer stays inside',
      enter: (carousel: HTMLElement, button: HTMLElement) => {
        fireEvent.focus(button)
        fireEvent.pointerEnter(carousel)
      },
      leaveOne: (_: HTMLElement, button: HTMLElement) =>
        fireEvent.blur(button, { relatedTarget: null }),
      leaveOther: (carousel: HTMLElement) => fireEvent.pointerLeave(carousel),
    },
  ])('stays paused when $case', ({ enter, leaveOne, leaveOther }) => {
    renderCarousel()
    const carousel = screen.getByRole('region', { name: 'Upgrade benefits' })
    const [firstDot] = screen.getAllByRole('button')
    if (!firstDot) throw new Error('Expected the slide buttons')
    const firstSlide = activeSlide()

    enter(carousel, firstDot)
    leaveOne(carousel, firstDot)
    waitOneInterval()
    expect(activeSlide()).toBe(firstSlide)

    leaveOther(carousel, firstDot)
    waitOneInterval()
    expect(activeSlide()).not.toBe(firstSlide)
  })
})
