import '@testing-library/jest-dom'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { PaymentMethodRow } from './PaymentMethodRow'
import { PaymentDialogBase } from './TokenPickerDialog'

i18n.loadAndActivate({ locale: 'en', messages: {} })

const feeRow = (
  <PaymentMethodRow
    amount="$100.00"
    amountLabel="available"
    fee="Est. fee: $4.32"
    icon={<span>$</span>}
    isAvailable
    isSelected
    name="ETH"
    nameBadge={
      <Tooltip>
        <TooltipTrigger aria-label="What is the ETH swap?" type="button">
          i
        </TooltipTrigger>
        <TooltipContent>Swap explanation</TooltipContent>
      </Tooltip>
    }
    onSelect={() => {}}
    selectLabel="Pay with ETH"
  />
)

describe('PaymentDialogBase', () => {
  // The first focusable element inside is an info button, and a tooltip opens
  // on focus, so auto-focus used to open the sheet with the price covered.
  it('takes focus itself rather than the first info button', async () => {
    render(
      <I18nProvider i18n={i18n}>
        <PaymentDialogBase
          onOpenChange={() => {}}
          open
          registrationLayout
          title="Select payment"
        >
          {feeRow}
        </PaymentDialogBase>
      </I18nProvider>,
    )

    const trigger = await screen.findByRole('button', {
      name: 'What is the ETH swap?',
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

  it('uses a stable viewport-safe size for registration', () => {
    render(
      <I18nProvider i18n={i18n}>
        <PaymentDialogBase
          onOpenChange={() => {}}
          open
          registrationLayout
          title="Select payment"
        >
          {feeRow}
        </PaymentDialogBase>
      </I18nProvider>,
    )

    expect(screen.getByRole('dialog')).toHaveClass(
      'h-[calc(100dvh-2rem)]',
      'min-h-0',
      'sm:h-[min(760px,90dvh)]',
      'sm:w-[32rem]',
    )
    expect(screen.getByRole('dialog')).not.toHaveClass('max-h-[90vh]')
  })

  it('preserves renewal sizing and autofocus by default', async () => {
    render(
      <I18nProvider i18n={i18n}>
        <PaymentDialogBase onOpenChange={() => {}} open title="Renew name">
          <button type="button">Renew</button>
        </PaymentDialogBase>
      </I18nProvider>,
    )

    const action = screen.getByRole('button', { name: 'Renew' })
    await waitFor(() => expect(action).toHaveFocus())
    expect(screen.getByRole('dialog')).toHaveClass(
      'max-h-[90vh]',
      'min-h-[500px]',
    )
    expect(screen.getByRole('dialog')).not.toHaveClass('min-h-0')
  })
})
