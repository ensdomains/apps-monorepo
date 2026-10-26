import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PaymentMethodIcon } from './PaymentMethodIcon'
import { PaymentMethodRow } from './PaymentMethodRow'

const renderRow = (
  props: Partial<Parameters<typeof PaymentMethodRow>[0]> = {},
) =>
  render(
    <PaymentMethodRow
      amount="$0.00"
      amountLabel="balance"
      fee="Sepolia est. fee: $0.27"
      feeTooltip="An estimate of what the two on-chain transactions that register your name will cost. It is collected together with the name price, in the same approval."
      feeTooltipLabel="What is the network fee?"
      icon={
        <PaymentMethodIcon
          icon={<span data-testid="token-icon">$</span>}
          networkBadge={<span data-testid="network-badge">◆</span>}
        />
      }
      isAvailable
      isInsufficient
      isSelected
      name="USDC"
      onSelect={() => {}}
      selectLabel="Select USDC"
      {...props}
    />,
  )

describe('PaymentMethodRow', () => {
  it('renders the exact fee, balance and tooltip', () => {
    renderRow({ isFeeTooltipOpen: true })

    expect(screen.getByText('USDC')).toBeVisible()
    expect(screen.getByText('$0.00')).toBeVisible()
    expect(screen.getByText('balance')).toBeVisible()
    expect(screen.getByText('Sepolia est. fee: $0.27')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'What is the network fee?' }),
    ).toBeVisible()
    expect(
      screen.getAllByText(
        'An estimate of what the two on-chain transactions that register your name will cost. It is collected together with the name price, in the same approval.',
      )[0],
    ).toBeVisible()
    expect(screen.getByTestId('token-icon')).toBeVisible()
    expect(screen.getByTestId('network-badge')).toBeVisible()
  })

  it('selects a method whose balance falls short, and shows that amount in red', () => {
    const onSelect = vi.fn()
    renderRow({ onSelect })

    screen.getByRole('button', { name: 'Select USDC' }).click()

    expect(onSelect).toHaveBeenCalledOnce()
    expect(screen.getByText('$0.00')).toHaveClass('text-ens-error')
  })

  it('disables an unavailable method', () => {
    renderRow({ isAvailable: false })

    expect(screen.getByRole('button', { name: 'Select USDC' })).toBeDisabled()
  })

  it('uses the standard keyboard-visible ring on the overlay control', () => {
    renderRow()

    expect(screen.getByRole('button', { name: 'Select USDC' })).toHaveClass(
      'outline-none',
      'focus-visible:ring-2',
      'focus-visible:ring-ens-blue',
      'focus-visible:ring-offset-2',
    )
  })

  it('top-aligns all three tracks without a fixed height or minimum height', () => {
    const { container } = renderRow()
    const row = container.querySelector('[data-slot="payment-method-row"]')

    expect(row).toHaveClass('items-start')
    expect(
      container.querySelector('[data-slot="payment-method-icon"]'),
    ).toHaveClass('self-start')
    expect(
      container.querySelector('[data-slot="payment-method-details"]'),
    ).toHaveClass('self-start')
    expect(
      container.querySelector('[data-slot="payment-method-amount"]'),
    ).toHaveClass('self-start')
    expect(row?.className).not.toMatch(/(?:^|\s)(?:h|min-h)-/)
  })
})
