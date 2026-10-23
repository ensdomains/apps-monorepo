import '@testing-library/jest-dom'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({
  prompt: null as unknown,
  approve: vi.fn(),
  decline: vi.fn(),
  send: vi.fn(),
}))
vi.mock('@/features/renew/state/renewalUi.context', () => ({
  useRenewalUiContext: () => ({
    uiActor: { send: mock.send },
    label: 'abc',
    fundingPrompt: mock.prompt,
    isFundingDecisionPending: !!mock.prompt,
    approveFunding: mock.approve,
    declineFunding: mock.decline,
  }),
}))
vi.mock('@/features/renew/state/renewalUi.selectors', () => ({
  useIsAwaitingRenewalApproval: () => true,
}))
vi.mock('@xstate/react', () => ({ useSelector: () => false }))
vi.mock('./TokenPickerContent', () => ({
  TokenPickerContent: () => <p>Signing state</p>,
}))

import { TokenPickerDialog } from './TokenPickerDialog'

i18n.loadAndActivate({ locale: 'en', messages: {} })
beforeEach(() => {
  vi.clearAllMocks()
  mock.prompt = null
})
const show = () =>
  render(
    <I18nProvider i18n={i18n}>
      <TokenPickerDialog />
    </I18nProvider>,
  )
describe('single renewal payment dialog', () => {
  it('replaces content in the same modal when the amount increases', () => {
    const view = show()
    const dialog = screen.getByRole('dialog')
    expect(screen.getByText('Signing state')).toBeVisible()
    mock.prompt = {
      permitValue: 6700000n,
      requiresPermit: true,
      requiredUsdc: 9680000n,
      quotedFeeUsdc: 20000n,
      hcaBalanceUsdc: 3000000n,
    }
    view.rerender(
      <I18nProvider i18n={i18n}>
        <TokenPickerDialog />
      </I18nProvider>,
    )
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByRole('dialog')).toBe(dialog)
    expect(
      screen.getByRole('button', { name: 'Sign payment approval' }),
    ).toBeVisible()
    expect(mock.approve).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(mock.decline).toHaveBeenCalledOnce()
  })
  it('declines the changed amount if its modal is dismissed', () => {
    mock.prompt = {
      permitValue: 6700000n,
      requiresPermit: true,
      requiredUsdc: 9680000n,
      quotedFeeUsdc: 20000n,
      hcaBalanceUsdc: 3000000n,
    }
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(mock.decline).toHaveBeenCalledOnce()
    expect(mock.approve).not.toHaveBeenCalled()
  })
})
