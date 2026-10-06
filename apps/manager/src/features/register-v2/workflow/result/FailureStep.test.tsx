import '@testing-library/jest-dom'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FailureStepView } from './FailureStep'

i18n.loadAndActivate({ locale: 'en', messages: {} })

const renderView = (
  props: Partial<Parameters<typeof FailureStepView>[0]> = {},
) =>
  render(
    <I18nProvider i18n={i18n}>
      <FailureStepView
        label="name-two"
        message="Something went wrong."
        onCancel={vi.fn()}
        onRetry={vi.fn()}
        {...props}
      />
    </I18nProvider>,
  )

describe('FailureStepView', () => {
  // The refusal used to read as a failed registration, with Try Again as the
  // main action, when nothing had run and the fix is in the other tab.
  it('presents a wallet held elsewhere as a wait, not a failure', () => {
    renderView({
      message: 'name-one.eth is already being registered with this wallet.',
      isWalletBusy: true,
    })

    expect(screen.getByText('Another Registration Is Running')).toBeVisible()
    expect(screen.queryByText('Registration Failed')).not.toBeInTheDocument()
    expect(
      screen.getByText(/finish or cancel the other registration/i),
    ).toBeVisible()
    // Back to Quote leads; Try Again stays for when the other run is done.
    expect(screen.getByRole('button', { name: 'Back to Quote' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeVisible()
  })

  it('still reports a real failure as one', () => {
    renderView()

    expect(screen.getByText('Registration Failed')).toBeVisible()
    expect(
      screen.getByText(/retrying will attempt the registration/i),
    ).toBeVisible()
  })
})
