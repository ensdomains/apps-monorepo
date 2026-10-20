import '@testing-library/jest-dom'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen } from '@testing-library/react'
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
        onFindAnotherName={vi.fn()}
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

  it('explains a lost race instead of showing the raw error', () => {
    const onFindAnotherName = vi.fn()
    renderView({
      onFindAnotherName,
      message:
        'The contract function "getRegisterPrice" reverted with the following signature: 0x477707e8',
      nameUnavailable: true,
    })

    expect(screen.getByText('Name No Longer Available')).toBeVisible()
    expect(
      screen.getByText(
        'name-two.eth was registered by someone else just before your registration went through.',
      ),
    ).toBeVisible()
    expect(screen.queryByText(/getRegisterPrice/)).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Try Again' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Back to Quote' }),
    ).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: 'Look for a different name' }),
    )
    expect(onFindAnotherName).toHaveBeenCalledOnce()
  })

  it('still reports a real failure as one', () => {
    renderView()

    expect(screen.getByText('Registration Failed')).toBeVisible()
    expect(
      screen.getByText(/retrying will attempt the registration/i),
    ).toBeVisible()
  })
})
