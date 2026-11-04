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
        isTotalPending={false}
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

/** What the card shows, leaving out placeholders hidden from assistive tech. */
const shownText = () => {
  const copy = document.body.cloneNode(true)
  if (!(copy instanceof HTMLElement)) return ''
  for (const hidden of copy.querySelectorAll('[aria-hidden="true"]'))
    hidden.remove()
  return copy.textContent ?? ''
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

  const withBalance = {
    nameCostRaw: 330_000_000n,
    existingBalanceRaw: 3_000_000n,
    totalRaw: 327_000_000n,
  }

  it.each([
    ['the balance is read', { isTotalPending: true }],
    ['the account is restored', { action: { kind: 'loading' } as const }],
  ])(
    'keeps the rows and shows only the name cost while %s',
    (_case, overrides) => {
      renderCard({ summary: withBalance, ...overrides })

      expect(screen.getByText('Name cost')).toBeVisible()
      expect(screen.getByText('$330.00')).toBeVisible()
      expect(shownText()).not.toContain('3.00USD')
      expect(shownText()).not.toContain('327.00')
    },
  )

  it('shows no total before the name is priced', () => {
    renderCard({ summary: undefined, isLoading: true })

    expect(shownText()).not.toContain('0.00')
  })

  it('waits with a disabled Loading button while the account is restored', () => {
    const onContinue = renderCard({ action: { kind: 'loading' } })

    const button = screen.getByRole('button', { name: 'Loading...' })
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(onContinue).not.toHaveBeenCalled()
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
