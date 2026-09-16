import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { render } from '@/utils/test-utils'
import { RenewToDatePopover } from './RenewToDatePopover'

const pressKeys = (keys: string[]) => {
  for (const key of keys) {
    fireEvent.keyDown(document, { key, code: `Key${key.toUpperCase()}` })
  }
}

describe('RenewToDatePopover', () => {
  it('does not render a Minimum button when the calendar is open', async () => {
    render(
      <RenewToDatePopover
        minSelectableDate={new Date(2040, 6, 1)}
        onPickDate={vi.fn()}
        selection={{ kind: 'preset', years: 1 }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /renew to date/i }))

    await waitFor(() => {
      expect(document.querySelector('[data-slot="calendar"]')).toBeTruthy()
    })
    expect(
      screen.queryByRole('button', { name: 'Minimum' }),
    ).not.toBeInTheDocument()
  })

  it('selects the minimum date when MIN is typed while the calendar is open', async () => {
    const minSelectableDate = new Date(2040, 6, 1)
    const onPickDate = vi.fn()

    render(
      <RenewToDatePopover
        minSelectableDate={minSelectableDate}
        onPickDate={onPickDate}
        selection={{ kind: 'preset', years: 1 }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /renew to date/i }))
    await waitFor(() => {
      expect(document.querySelector('[data-slot="calendar"]')).toBeTruthy()
    })

    pressKeys(['m', 'i', 'n'])

    const expected = new Date(minSelectableDate)
    expected.setHours(0, 0, 0, 0)
    expect(onPickDate).toHaveBeenCalledWith(expected)
    await waitFor(() => {
      expect(document.querySelector('[data-slot="calendar"]')).toBeNull()
    })
  })

  it('does nothing when MIN is typed while the calendar is closed', () => {
    const onPickDate = vi.fn()

    render(
      <RenewToDatePopover
        minSelectableDate={new Date(2040, 6, 1)}
        onPickDate={onPickDate}
        selection={{ kind: 'preset', years: 1 }}
      />,
    )

    pressKeys(['m', 'i', 'n'])

    expect(onPickDate).not.toHaveBeenCalled()
  })
})
