import '@testing-library/jest-dom'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FailureStep, FailureStepView } from './FailureStep'

// The failure and this browser's session reset are stubbed so the container's wiring runs.
const signals = vi.hoisted(() => ({
  isSessionAccessReset: false,
  isSignatureRejected: false,
}))

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => vi.fn(),
}))
vi.mock('@/lib/smart-account/SmartAccountContext', () => ({
  useSmartAccountContext: () => ({
    isSessionAccessReset: signals.isSessionAccessReset,
  }),
}))
vi.mock('../../state/registrationUi.context', () => ({
  RegisterV2Context: {
    use: () => ({
      uiActor: { send: () => {} },
      label: 'name-two',
      resume: { status: 'idle' },
    }),
    useSelector: (select: (state: unknown) => unknown) =>
      select({
        context: {
          lastErrorMessage:
            'Failed to submit transaction: Simulation failed: InvalidSignature()',
          nameUnavailable: false,
          isWalletBusy: false,
          isSignatureRejected: signals.isSignatureRejected,
          restoredRun: undefined,
        },
      }),
  },
}))

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

  it('explains a reset session instead of showing the raw error', () => {
    renderView({
      message:
        'Failed to submit transaction: Simulation failed: InvalidSignature() (errorType=Bad Request statusCode=400)',
      isSessionRevoked: true,
    })

    expect(screen.getByText('Smart Session Access Reset')).toBeVisible()
    expect(
      screen.getByText(/smart session access was reset while name-two\.eth/i),
    ).toBeVisible()
    expect(screen.queryByText(/InvalidSignature/)).not.toBeInTheDocument()
    expect(screen.queryByText(/retrying will attempt/i)).not.toBeInTheDocument()
    expect(
      screen.getByText(/trying again would use the old session/i),
    ).toBeVisible()
  })

  it('explains an emptied smart account and sends the user back to the quote', () => {
    const onCancel = vi.fn()
    renderView({
      onCancel,
      message:
        'Failed to submit transaction: No viable route found for this intent. (statusCode=422 context={"failureCodes":["INSUFFICIENT_BALANCE"]})',
      failureReason: 'insufficientFunds',
    })

    expect(screen.getByText('Not Enough Funds to Finish')).toBeVisible()
    expect(
      screen.getByText(
        /no longer has enough funds to finish registering name-two\.eth/,
      ),
    ).toBeVisible()
    expect(screen.queryByText(/No viable route/)).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Try Again' }),
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Back to Quote' }))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('explains a session authorization the owner did not sign, and keeps Try Again', () => {
    const onRetry = vi.fn()
    renderView({ onRetry, message: '', failureReason: 'sessionSignerMismatch' })

    expect(
      screen.getByText(/your wallet signed a different request/i),
    ).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('still reports a real failure as one', () => {
    renderView()

    expect(screen.getByText('Registration Failed')).toBeVisible()
    expect(
      screen.getByText(/retrying will attempt the registration/i),
    ).toBeVisible()
  })
})

describe('FailureStep', () => {
  it('shows the reset screen when a reset meets a refused signature', () => {
    signals.isSessionAccessReset = true
    signals.isSignatureRejected = true
    render(
      <I18nProvider i18n={i18n}>
        <FailureStep />
      </I18nProvider>,
    )

    expect(screen.getByText('Smart Session Access Reset')).toBeVisible()
  })

  // The live reset flag clears on a new session and can be set after the failure.
  it.each([
    [
      'a new session is signed after the reset',
      true,
      false,
      'Smart Session Access Reset',
    ],
    ['the reset comes after the failure', false, true, 'Registration Failed'],
  ])(
    'keeps the title it opened with when %s',
    (_, isResetAtFailure, isResetLater, title) => {
      signals.isSessionAccessReset = isResetAtFailure
      signals.isSignatureRejected = true
      const view = () => (
        <I18nProvider i18n={i18n}>
          <FailureStep />
        </I18nProvider>
      )
      const { rerender } = render(view())

      signals.isSessionAccessReset = isResetLater
      rerender(view())

      expect(screen.getByText(title)).toBeVisible()
    },
  )
})
