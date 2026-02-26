import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PricingRegistrationSummaryCard } from './PricingRegistrationSummaryCard'

vi.mock('@/components/ui/calendar', () => ({
  Calendar: ({
    onSelect,
    selected,
  }: {
    onSelect: (date: Date | undefined) => void
    selected: Date
  }) => (
    <div data-testid="calendar">
      <button onClick={() => onSelect(selected)} type="button">
        Apply
      </button>
      <button onClick={() => onSelect(undefined)} type="button">
        Clear
      </button>
    </div>
  ),
}))

vi.mock('@/components/ui/popover', () => ({
  Popover: ({
    children,
    open,
  }: {
    children: React.ReactNode
    open: boolean
  }) => (
    <div data-open={open} data-testid="popover">
      {children}
    </div>
  ),
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="popover-content">{children}</div>
  ),
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="popover-trigger">{children}</div>
  ),
}))

describe('PricingRegistrationSummaryCard', () => {
  const defaultProps = {
    paddedDuration: '1',
    formattedExpiration: 'January 1, 2027',
    expirationDate: new Date(2027, 0, 1),
    onChange: vi.fn(),
    durationInputValue: '1',
    onInputChange: vi.fn(),
  }

  it('renders duration and expiration', () => {
    render(<PricingRegistrationSummaryCard {...defaultProps} />)
    expect(screen.getByDisplayValue('1')).toBeInTheDocument()
    expect(screen.getByText('January 1, 2027')).toBeInTheDocument()
    expect(screen.getByText('Registering for')).toBeInTheDocument()
    expect(screen.getByText('years')).toBeInTheDocument()
  })

  it('calls onInputChange and onChange when duration input gets valid value', async () => {
    const onChange = vi.fn()
    const onInputChange = vi.fn()
    render(
      <PricingRegistrationSummaryCard
        {...defaultProps}
        onChange={onChange}
        onInputChange={onInputChange}
      />,
    )
    const input = screen.getByRole('spinbutton')
    fireEvent.change(input, { target: { value: '5' } })
    await waitFor(() => {
      expect(onInputChange).toHaveBeenCalledWith('5')
    })
    expect(onChange).toHaveBeenCalledWith(5)
  })

  it('does not call onChange for non-numeric duration input', () => {
    const onChange = vi.fn()
    const onInputChange = vi.fn()
    render(
      <PricingRegistrationSummaryCard
        {...defaultProps}
        onChange={onChange}
        onInputChange={onInputChange}
      />,
    )
    const input = screen.getByRole('spinbutton')
    fireEvent.change(input, { target: { value: 'abc' } })
    // Component may call onInputChange for empty string when normalized is ''
    expect(onChange).not.toHaveBeenCalled()
  })

  it('normalizes comma to dot in duration input', async () => {
    const onInputChange = vi.fn()
    render(
      <PricingRegistrationSummaryCard
        {...defaultProps}
        onInputChange={onInputChange}
      />,
    )
    const input = screen.getByRole('spinbutton')
    fireEvent.change(input, { target: { value: '2,5' } })
    await waitFor(() => {
      expect(onInputChange).toHaveBeenCalledWith('2.5')
    })
  })

  it('calls onChange with date when calendar applies', () => {
    const onChange = vi.fn()
    render(
      <PricingRegistrationSummaryCard {...defaultProps} onChange={onChange} />,
    )
    const applyBtn = screen.getByText('Apply')
    fireEvent.click(applyBtn)
    expect(onChange).toHaveBeenCalledWith(defaultProps.expirationDate)
  })

  it('calls onChange with undefined when calendar clear is clicked', () => {
    const onChange = vi.fn()
    render(
      <PricingRegistrationSummaryCard {...defaultProps} onChange={onChange} />,
    )
    const clearBtn = screen.getByText('Clear')
    fireEvent.click(clearBtn)
    expect(onChange).toHaveBeenCalledWith(undefined)
  })

  it('blur clamps invalid duration to minimum and updates input', async () => {
    const onChange = vi.fn()
    const onInputChange = vi.fn()
    render(
      <PricingRegistrationSummaryCard
        {...defaultProps}
        durationInputValue=""
        onChange={onChange}
        onInputChange={onInputChange}
      />,
    )
    const input = screen.getByRole('spinbutton')
    fireEvent.focus(input)
    fireEvent.blur(input)
    await waitFor(() => {
      expect(onChange).toHaveBeenCalled()
      expect(onInputChange).toHaveBeenCalled()
    })
  })
})
