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
      error="not enough funds to pay network fees"
      fee="Mainnet est. fee: $0.27"
      feeTooltip="An estimate of what the two on-chain transactions that register your name will cost. It is collected together with the name price, in the same approval."
      feeTooltipLabel="What is the network fee?"
      icon={
        <PaymentMethodIcon
          icon={<span data-testid="token-icon">$</span>}
          networkBadge={<span data-testid="network-badge">◆</span>}
        />
      }
      isAvailable
      isFunded={false}
      isSelected
      name="USDC"
      onSelect={() => {}}
      selectLabel="Select USDC"
      {...props}
    />,
  )

describe('PaymentMethodRow', () => {
  it('renders the exact fee, balance, tooltip, and shared error copy', () => {
    renderRow({ isFeeTooltipOpen: true })

    expect(screen.getByText('USDC')).toBeVisible()
    expect(screen.getByText('$0.00')).toBeVisible()
    expect(screen.getByText('balance')).toBeVisible()
    expect(screen.getByText('Mainnet est. fee: $0.27')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'What is the network fee?' }),
    ).toBeVisible()
    expect(
      screen.getAllByText(
        'An estimate of what the two on-chain transactions that register your name will cost. It is collected together with the name price, in the same approval.',
      )[0],
    ).toBeVisible()
    expect(
      screen.getByText('not enough funds to pay network fees'),
    ).toBeVisible()
    expect(screen.getByTestId('token-icon')).toBeVisible()
    expect(screen.getByTestId('network-badge')).toBeVisible()
  })

  it('disables an unfunded method and links its error description', () => {
    renderRow()

    const selectButton = screen.getByRole('button', { name: 'Select USDC' })
    const error = screen.getByText('not enough funds to pay network fees')

    expect(selectButton).toBeDisabled()
    expect(selectButton).toHaveAttribute('aria-pressed', 'true')
    expect(selectButton).toHaveAttribute(
      'aria-describedby',
      error.parentElement?.id,
    )
  })

  it('selects an available funded method', () => {
    const onSelect = vi.fn()
    renderRow({ error: undefined, isFunded: true, onSelect })

    screen.getByRole('button', { name: 'Select USDC' }).click()

    expect(onSelect).toHaveBeenCalledOnce()
  })

  it('keeps the error icon before its copy in one shared spanning item', () => {
    const { container } = renderRow()
    const error = container.querySelector('[data-slot="payment-method-error"]')

    expect(error).toHaveClass('col-[2/4]')
    expect(error).toHaveTextContent(
      'flash_offnot enough funds to pay network fees',
    )
    expect(error?.querySelector('.material-symbol')).toHaveTextContent(
      'flash_off',
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
