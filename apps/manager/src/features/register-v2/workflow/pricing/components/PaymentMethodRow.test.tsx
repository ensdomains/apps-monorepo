import '@testing-library/jest-dom'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PaymentMethodRow } from './PaymentMethodRow'

i18n.loadAndActivate({ locale: 'en', messages: {} })

const renderRow = (
  props: Partial<Parameters<typeof PaymentMethodRow>[0]> = {},
) =>
  render(
    <I18nProvider i18n={i18n}>
      <PaymentMethodRow
        amount="$0.00"
        amountLabel="balance"
        fee="Sepolia est. fee: $0.27"
        icon={<span>$</span>}
        isAvailable
        isInsufficient
        isSelected
        name="USDC"
        onSelect={() => {}}
        selectLabel="Select USDC"
        {...props}
      />
    </I18nProvider>,
  )

describe('PaymentMethodRow', () => {
  it('selects a method whose balance falls short, and shows that amount in red', () => {
    const onSelect = vi.fn()
    renderRow({ onSelect })

    screen.getByRole('button', { name: 'Select USDC' }).click()

    expect(onSelect).toHaveBeenCalledOnce()
    expect(screen.getByText('$0.00')).toHaveClass('text-ens-signal-danger-800')
  })

  it('disables an unavailable method', () => {
    renderRow({ isAvailable: false })

    expect(screen.getByRole('button', { name: 'Select USDC' })).toBeDisabled()
  })
})
