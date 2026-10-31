import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NameHeading } from './NameHeading'

describe('NameHeading', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn() },
      configurable: true,
    })
  })

  it('copies the name from a button kept outside the heading', async () => {
    render(<NameHeading name="rustic-sparrow.eth" />)

    expect(
      screen.getByRole('heading', { level: 1, name: 'rustic-sparrow.eth' }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Copy value' }))

    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        'rustic-sparrow.eth',
      ),
    )
  })
})
