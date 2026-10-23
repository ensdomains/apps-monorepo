import '@testing-library/jest-dom'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RenewalPaymentUpdate } from './RenewalPaymentUpdate'

i18n.loadAndActivate({ locale: 'en', messages: {} })
const prompt = {
  permitValue: 6700001n,
  requiresPermit: true,
  requiredUsdc: 9680000n,
  quotedFeeUsdc: 20001n,
  hcaBalanceUsdc: 3000000n,
}
describe('RenewalPaymentUpdate', () => {
  it('keeps the updated receipt visible while wallet signing is pending', () => {
    render(
      <I18nProvider i18n={i18n}>
        <RenewalPaymentUpdate
          isSigning
          label="abc"
          onApprove={() => {}}
          onDecline={() => {}}
          prompt={prompt}
        />
      </I18nProvider>,
    )
    expect(screen.getByText('$6.71')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Sign in wallet' }),
    ).toBeDisabled()
    expect(
      screen.queryByRole('button', { name: 'Cancel' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByText(
        'Confirm the requests in your wallet to finish renewing.',
      ),
    ).toBeVisible()
  })

  it('uses the same receipt and waits for an explicit updated-amount confirmation', () => {
    const onApprove = vi.fn(),
      onDecline = vi.fn()
    render(
      <I18nProvider i18n={i18n}>
        <RenewalPaymentUpdate
          isSigning={false}
          label="abc"
          onApprove={onApprove}
          onDecline={onDecline}
          prompt={prompt}
        />
      </I18nProvider>,
    )
    expect(screen.getByText('Renewal total')).toBeVisible()
    expect(screen.getByText('Available balance applied')).toBeVisible()
    expect(screen.getByText('Due from your wallet')).toBeVisible()
    expect(screen.getByText('$6.71')).toBeVisible()
    expect(screen.getByText('Renewal payment updated')).toBeVisible()
    expect(onApprove).not.toHaveBeenCalled()
    fireEvent.click(
      screen.getByRole('button', { name: 'Sign payment approval' }),
    )
    expect(onApprove).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onDecline).toHaveBeenCalledOnce()
  })
  it('asks for the renewal signature when an existing allowance already covers the transfer', () => {
    render(
      <I18nProvider i18n={i18n}>
        <RenewalPaymentUpdate
          isSigning={false}
          label="abc"
          onApprove={() => {}}
          onDecline={() => {}}
          prompt={{ ...prompt, requiresPermit: false }}
        />
      </I18nProvider>,
    )
    expect(screen.getByRole('button', { name: 'Sign renewal' })).toBeVisible()
  })
})
