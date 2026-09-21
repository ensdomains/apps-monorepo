import '@testing-library/jest-dom'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ConfirmPurchaseBase } from './ConfirmPurchase'

i18n.loadAndActivate({ locale: 'en', messages: {} })

describe('ConfirmPurchaseBase', () => {
  it('shows the selected DAI payment method', () => {
    const { container } = render(
      <I18nProvider i18n={i18n}>
        <ConfirmPurchaseBase
          canNext
          label="jeff"
          nextMessage="Register name"
          onNext={() => {}}
          pricingData={330}
          selectedToken="DAI"
          title="Registering"
        />
      </I18nProvider>,
    )

    expect(screen.getByText('DAI')).toBeVisible()
    expect(container.querySelector('svg path[fill="#F5AC37"]')).toBeVisible()
  })
})
