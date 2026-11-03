import '@testing-library/jest-dom'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { CheckoutSummaryCard } from './CheckoutSummaryCard'

i18n.loadAndActivate({ locale: 'en', messages: {} })

const renderCard = (
  overrides: Partial<ComponentProps<typeof CheckoutSummaryCard>> = {},
) => {
  const onContinue = vi.fn()
  render(
    <I18nProvider i18n={i18n}>
      <CheckoutSummaryCard
        acceptsEth
        action={{ kind: 'continue', isEnabled: true }}
        connect={{ onConnect: () => {}, isOpen: false }}
        discount={0}
        isLoading={false}
        onContinue={onContinue}
        summary={{
          nameCostRaw: 330_000_000n,
          existingBalanceRaw: 0n,
          totalRaw: 330_000_000n,
        }}
        {...overrides}
      />
    </I18nProvider>,
  )
  return onContinue
}

describe('CheckoutSummaryCard', () => {
  it('shows the name cost, the existing balance and the total left to pay', () => {
    renderCard({
      summary: {
        nameCostRaw: 330_000_000n,
        existingBalanceRaw: 3_000_000n,
        totalRaw: 327_000_000n,
      },
    })

    expect(screen.getByText('Name cost')).toBeVisible()
    expect(screen.getByText('-$3.00')).toBeVisible()
    expect(screen.queryByText('Total USD')).not.toBeInTheDocument()
  })

  it('blocks the way to payment when no balance covers the total', () => {
    const onContinue = renderCard({ action: { kind: 'insufficient' } })

    const button = screen.getByRole('button', { name: 'Insufficient balance' })
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(onContinue).not.toHaveBeenCalled()
  })

  it('opens the payment sheet from Continue to payment', () => {
    const onContinue = renderCard()

    fireEvent.click(screen.getByRole('button', { name: 'Continue to payment' }))
    expect(onContinue).toHaveBeenCalledOnce()
  })
})
