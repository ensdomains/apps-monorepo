import { setupI18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MigrationRecipientErrorMessage } from './MigrationRecipientErrorMessage'

describe('migration recipient guidance', () => {
  it.each([
    ['recipient-incompatible', /Ask your wallet's support/],
    ['recipient-unavailable', /Try again before changing your wallet settings/],
  ] as const)('renders the next step for %s', (type, nextStep) => {
    const i18n = setupI18n({ locale: 'en', messages: { en: {} } })
    render(
      <I18nProvider i18n={i18n}>
        <MigrationRecipientErrorMessage
          error={{
            type,
            recipient: '0x00000000000000000000000000000000000000AB',
          }}
        />
      </I18nProvider>,
    )
    expect(screen.getByText(nextStep).textContent).toContain(
      '0x00000000000000000000000000000000000000AB',
    )
  })
})
