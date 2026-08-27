import '@testing-library/jest-dom'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { addSeconds, differenceInCalendarDays, startOfDay } from 'date-fns'
import { describe, expect, it, vi } from 'vitest'
import { getDurationInSecondsFromYears } from '@/features/register-v2/utils/time'
import { MIN_REGISTER_DURATION_SECONDS } from '@/features/shared/registration/pricing'
import { DurationCustomRow } from './DurationCustomRow'

i18n.loadAndActivate({ locale: 'en', messages: {} })

const pressKeys = (keys: string[]) => {
  for (const key of keys) {
    fireEvent.keyDown(document, { key, code: `Key${key.toUpperCase()}` })
  }
}

const expectedMinimumDuration = (referenceDate: Date) => {
  const minDate = new Date(
    addSeconds(referenceDate, MIN_REGISTER_DURATION_SECONDS),
  )
  minDate.setHours(0, 0, 0, 0)
  return Math.max(
    MIN_REGISTER_DURATION_SECONDS,
    differenceInCalendarDays(startOfDay(minDate), startOfDay(referenceDate)) *
      86_400,
  )
}

describe('DurationCustomRow', () => {
  it('shows the calendar-year expiry date for renewal presets', () => {
    const referenceDate = new Date('2026-07-29T18:00:00.000Z')
    const selectedDuration = getDurationInSecondsFromYears(1, referenceDate)

    render(
      <I18nProvider i18n={i18n}>
        <DurationCustomRow
          isSelected={false}
          onDurationSet={vi.fn()}
          referenceDate={referenceDate}
          selectedDuration={selectedDuration}
          type="renew"
        />
      </I18nProvider>,
    )

    expect(screen.getByText('July 29, 2027')).toBeInTheDocument()
    expect(screen.queryByText('July 30, 2027')).not.toBeInTheDocument()
  })

  it('does not render a Minimum button when the calendar is open', async () => {
    const referenceDate = new Date(2026, 6, 29)
    const selectedDuration = getDurationInSecondsFromYears(1, referenceDate)

    render(
      <I18nProvider i18n={i18n}>
        <DurationCustomRow
          isSelected={false}
          onDurationSet={vi.fn()}
          referenceDate={referenceDate}
          selectedDuration={selectedDuration}
          type="register"
        />
      </I18nProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: /register to date/i }))

    await waitFor(() => {
      expect(document.querySelector('[data-slot="calendar"]')).toBeTruthy()
    })
    expect(
      screen.queryByRole('button', { name: 'Minimum' }),
    ).not.toBeInTheDocument()
  })

  it('selects the minimum duration when MIN is typed while the calendar is open', async () => {
    const referenceDate = new Date(2026, 6, 29)
    const selectedDuration = getDurationInSecondsFromYears(1, referenceDate)
    const onDurationSet = vi.fn()

    render(
      <I18nProvider i18n={i18n}>
        <DurationCustomRow
          isSelected={false}
          onDurationSet={onDurationSet}
          referenceDate={referenceDate}
          selectedDuration={selectedDuration}
          type="register"
        />
      </I18nProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: /register to date/i }))
    await waitFor(() => {
      expect(document.querySelector('[data-slot="calendar"]')).toBeTruthy()
    })

    pressKeys(['m', 'i', 'n'])

    expect(onDurationSet).toHaveBeenCalledWith(
      expectedMinimumDuration(referenceDate),
    )
  })

  it('does nothing when MIN is typed while the calendar is closed', () => {
    const referenceDate = new Date(2026, 6, 29)
    const selectedDuration = getDurationInSecondsFromYears(1, referenceDate)
    const onDurationSet = vi.fn()

    render(
      <I18nProvider i18n={i18n}>
        <DurationCustomRow
          isSelected={false}
          onDurationSet={onDurationSet}
          referenceDate={referenceDate}
          selectedDuration={selectedDuration}
          type="register"
        />
      </I18nProvider>,
    )

    pressKeys(['m', 'i', 'n'])

    expect(onDurationSet).not.toHaveBeenCalled()
  })
})
