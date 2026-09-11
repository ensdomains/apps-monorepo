import '@testing-library/jest-dom'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NetworkCostRow } from './NetworkCostRow'
import { PaymentDialogBase } from './TokenPickerDialog'

i18n.loadAndActivate({ locale: 'en', messages: {} })

describe('PaymentDialogBase', () => {
  // The first focusable element inside is an info button, and a tooltip opens
  // on focus, so auto-focus used to open the sheet with the price covered.
  it('takes focus itself rather than the first info button', async () => {
    render(
      <I18nProvider i18n={i18n}>
        <PaymentDialogBase onOpenChange={() => {}} open title="Select payment">
          <NetworkCostRow isLoading={false} networkFee={4.32} />
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
})
