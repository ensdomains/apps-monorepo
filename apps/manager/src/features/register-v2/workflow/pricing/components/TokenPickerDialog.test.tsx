import '@testing-library/jest-dom'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PaymentMethodRow } from './PaymentMethodRow'
import { PaymentDialogBase } from './TokenPickerDialog'

i18n.loadAndActivate({ locale: 'en', messages: {} })

const feeRow = (
  <PaymentMethodRow
    amount="$100.00"
    amountLabel="balance"
    fee="Mainnet est. fee: $4.32"
    feeTooltip="Fee explanation"
    feeTooltipLabel="What is the network fee?"
    icon={<span>$</span>}
    isAvailable
    isFunded
    isSelected
    name="USDC"
    onSelect={() => {}}
    selectLabel="Select USDC"
  />
)

describe('PaymentDialogBase', () => {
  // The first focusable element inside is an info button, and a tooltip opens
  // on focus, so auto-focus used to open the sheet with the price covered.
  it('takes focus itself rather than the first info button', async () => {
    render(
      <I18nProvider i18n={i18n}>
        <PaymentDialogBase onOpenChange={() => {}} open title="Select payment">
          {feeRow}
        </PaymentDialogBase>
      </I18nProvider>,
    )

    const trigger = await screen.findByRole('button', {
      name: 'What is the network fee?',
    })

    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute(
        'data-slot',
        'dialog-content',
      ),
    )
    expect(trigger).not.toHaveFocus()
    expect(trigger).toHaveAttribute('data-state', 'closed')
  })

  it('uses viewport-safe mobile sizing and restores the desktop minimum', () => {
    render(
      <I18nProvider i18n={i18n}>
        <PaymentDialogBase onOpenChange={() => {}} open title="Select payment">
          {feeRow}
        </PaymentDialogBase>
      </I18nProvider>,
    )

    expect(screen.getByRole('dialog')).toHaveClass(
      'max-h-[90dvh]',
      'min-h-0',
      'sm:min-h-[500px]',
    )
    expect(screen.getByRole('dialog')).not.toHaveClass('max-h-[90vh]')
  })
})
