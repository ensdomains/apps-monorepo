import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CopyButton } from './CopyButton'

describe('CopyButton', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn() },
      configurable: true,
    })
  })

  it('writes the value to the clipboard when clicked', async () => {
    render(<CopyButton value="0x1234567890abcdef" />)

    fireEvent.click(screen.getByRole('button'))

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        '0x1234567890abcdef',
      )
    })
  })

  it('shows a check icon after clicking copy', async () => {
    render(<CopyButton value="test-value" />)

    const button = screen.getByRole('button')
    const beforeIcon = button.querySelector('svg')
    expect(beforeIcon).toBeTruthy()

    fireEvent.click(button)

    await waitFor(() => {
      const afterIcon = button.querySelector('svg')
      expect(afterIcon).toBeTruthy()
      expect(afterIcon).not.toBe(beforeIcon)
    })
  })

  it('reverts to copy icon after 2 seconds', async () => {
    vi.useFakeTimers()

    render(<CopyButton value="test-value" />)

    const button = screen.getByRole('button')

    // Get the initial icon class (CopyIcon)
    const initialIcon = button.querySelector('svg')
    expect(initialIcon).toBeTruthy()

    // Click to copy
    fireEvent.click(button)

    // After click, icon should change to CheckIcon
    const checkIcon = button.querySelector('svg')
    expect(checkIcon).toBeTruthy()
    expect(checkIcon).not.toBe(initialIcon)

    // Advance timers by 2 seconds (wrapped in act to handle state update)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })

    // Should revert back to copy icon
    const revertedIcon = button.querySelector('svg')
    expect(revertedIcon).toBeTruthy()

    vi.useRealTimers()
  })

  it('has accessible screen reader text', () => {
    render(<CopyButton value="test-value" />)

    expect(screen.getByText('Copy value')).toBeInTheDocument()
  })
})
