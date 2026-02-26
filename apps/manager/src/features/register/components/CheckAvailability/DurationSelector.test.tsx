import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PricingOptions } from '@/features/register/components/Pricing/types'
import { DurationSelector } from './DurationSelector'

const defaultPricing: PricingOptions = {
  1: { price: 10, discount: 0, label: '1 year', total: 10 },
  3: { price: 9, discount: 10, label: '3 years', total: 27 },
  5: { price: 8, discount: 20, label: '5 years', total: 40 },
  10: { price: 7, discount: 30, label: '10 years', total: 70 },
}

describe('DurationSelector', () => {
  const defaultProps = {
    pricing: defaultPricing,
    selectedDuration: 1 as number | null,
    onSelect: vi.fn(),
    durationInputValue: '1',
    onInputChange: vi.fn(),
  }

  it('renders predefined duration buttons', () => {
    render(<DurationSelector {...defaultProps} />)
    expect(screen.getByText('1 year')).toBeInTheDocument()
    expect(screen.getByText('3 years')).toBeInTheDocument()
    expect(screen.getByText('5 years')).toBeInTheDocument()
    expect(screen.getByText('10 years')).toBeInTheDocument()
  })

  it('renders custom duration row', () => {
    render(<DurationSelector {...defaultProps} />)
    expect(screen.getByText('Enter custom duration')).toBeInTheDocument()
    expect(
      screen.getByRole('spinbutton', { name: /custom duration/i }),
    ).toBeInTheDocument()
  })

  it('calls onSelect when predefined duration is clicked', () => {
    const onSelect = vi.fn()
    render(<DurationSelector {...defaultProps} onSelect={onSelect} />)
    const threeYearButton = screen.getByRole('button', { name: /3 year/ })
    fireEvent.click(threeYearButton)
    expect(onSelect).toHaveBeenCalledWith(3)
  })

  it('calls onInputChange and onSelect when custom input gets valid value', () => {
    const onSelect = vi.fn()
    const onInputChange = vi.fn()
    render(
      <DurationSelector
        {...defaultProps}
        durationInputValue="2.5"
        onInputChange={onInputChange}
        onSelect={onSelect}
        selectedDuration={2.5}
      />,
    )
    const customInput = screen.getByRole('spinbutton', {
      name: /custom duration/i,
    })
    fireEvent.focus(customInput)
    fireEvent.change(customInput, { target: { value: '7' } })
    expect(onInputChange).toHaveBeenCalledWith('7')
    expect(onSelect).toHaveBeenCalled()
  })

  it('allows clearing custom input and calls onInputChange when value becomes empty', () => {
    const onInputChange = vi.fn()
    render(
      <DurationSelector
        {...defaultProps}
        durationInputValue="2.5"
        onInputChange={onInputChange}
        selectedDuration={2.5}
      />,
    )
    const customInput = screen.getByRole('spinbutton', {
      name: /custom duration/i,
    })
    fireEvent.focus(customInput)
    fireEvent.change(customInput, { target: { value: '' } })
    expect(onInputChange).toHaveBeenCalledWith('')
  })

  it('on blur with empty custom input calls onSelect with minimum and onInputChange', () => {
    const onSelect = vi.fn()
    const onInputChange = vi.fn()
    render(
      <DurationSelector
        {...defaultProps}
        durationInputValue=""
        onInputChange={onInputChange}
        onSelect={onSelect}
        selectedDuration={null}
      />,
    )
    const customInput = screen.getByRole('spinbutton', {
      name: /custom duration/i,
    })
    fireEvent.focus(customInput)
    fireEvent.blur(customInput)
    expect(onSelect).toHaveBeenCalled()
    expect(onInputChange).toHaveBeenCalled()
  })

  it('displays discount badge when option has discount', () => {
    render(<DurationSelector {...defaultProps} />)
    expect(screen.getByText('10% off')).toBeInTheDocument()
    expect(screen.getByText('20% off')).toBeInTheDocument()
    expect(screen.getByText('30% off')).toBeInTheDocument()
  })

  it('disables buttons when disabled prop is true', () => {
    render(<DurationSelector {...defaultProps} disabled />)
    const buttons = screen.getAllByRole('button')
    buttons.forEach((btn) => {
      if (btn.getAttribute('type') === 'button') {
        expect(btn).toBeDisabled()
      }
    })
  })
})
