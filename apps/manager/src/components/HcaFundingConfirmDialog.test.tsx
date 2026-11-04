import '@testing-library/jest-dom'
import type { HcaFundingPrompt } from '@ens-apps/transaction-manager'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { keepClosingDialogsMounted } from '@/test-utils/exitAnimation'
import { HcaFundingConfirmDialog } from './HcaFundingConfirmDialog'

i18n.loadAndActivate({ locale: 'en', messages: {} })

const dialog = (prompt: HcaFundingPrompt | null) => (
  <I18nProvider i18n={i18n}>
    <HcaFundingConfirmDialog
      description={() => 'Paid out of your smart account.'}
      onApprove={() => {}}
      onDecline={() => {}}
      prompt={prompt}
      title="Approve the payment?"
    />
  </I18nProvider>
)

const renderDialog = (prompt: HcaFundingPrompt) => render(dialog(prompt))

const ONE_DAI = 10n ** 18n

afterEach(() => {
  vi.restoreAllMocks()
})

describe('HcaFundingConfirmDialog', () => {
  it('shows what each token takes from the account and the wallet', () => {
    // Price in DAI, fee in USDC: two amounts, so two approvals.
    renderDialog({
      permitValue: 900_000n,
      requiresPermit: true,
      quotedFeeUsdc: 900_000n,
      hcaBalanceUsdc: 0n,
      requiredUsdc: 0n,
      token: {
        symbol: 'DAI',
        decimals: 18,
        required: 2n * ONE_DAI,
        hcaBalance: ONE_DAI / 2n,
        permitValue: (3n * ONE_DAI) / 2n,
        requiresPermit: true,
      },
    })

    expect(screen.getByText('−0.5 DAI')).toBeInTheDocument()
    expect(screen.getByText('1.5 DAI')).toBeInTheDocument()
    expect(screen.getByText('0.9 USDC')).toBeInTheDocument()
    expect(screen.getAllByText('You approve')).toHaveLength(2)
    expect(
      screen.getByText(/asked to approve these exact amounts/),
    ).toBeInTheDocument()
  })

  it('discloses the unlimited allowance mainnet DAI’s permit grants', () => {
    renderDialog({
      permitValue: 900_000n,
      requiresPermit: true,
      quotedFeeUsdc: 900_000n,
      hcaBalanceUsdc: 0n,
      requiredUsdc: 0n,
      token: {
        symbol: 'DAI',
        decimals: 18,
        required: 2n * ONE_DAI,
        hcaBalance: 0n,
        permitValue: 2n * ONE_DAI,
        requiresPermit: true,
        hasUnlimitedAllowance: true,
      },
    })

    expect(screen.getByText(/unlimited DAI allowance/)).toBeInTheDocument()
    expect(screen.queryByText(/nothing more/)).not.toBeInTheDocument()
    // The DAI row is what moves, not what is approved; USDC stays exact.
    expect(screen.getAllByText('You approve')).toHaveLength(1)
    expect(screen.getByText('From your wallet')).toBeInTheDocument()
  })

  it('does not promise an approval a standing allowance makes unnecessary', () => {
    renderDialog({
      permitValue: 2_500_000n,
      requiresPermit: false,
      quotedFeeUsdc: 900_000n,
      hcaBalanceUsdc: 400_000n,
      requiredUsdc: 2_000_000n,
    })

    expect(screen.getByText('−0.4 USDC')).toBeInTheDocument()
    expect(screen.getByText('From your wallet')).toBeInTheDocument()
    expect(screen.getByText('2.5 USDC')).toBeInTheDocument()
    expect(screen.queryByText('You approve')).not.toBeInTheDocument()
    expect(screen.getByText(/won't be asked to approve it/)).toBeInTheDocument()
  })

  it('keeps the amounts on screen while it closes for the wallet', () => {
    keepClosingDialogsMounted()
    const prompt: HcaFundingPrompt = {
      permitValue: 2_500_000n,
      requiresPermit: true,
      quotedFeeUsdc: 900_000n,
      hcaBalanceUsdc: 400_000n,
      requiredUsdc: 2_000_000n,
    }
    // Mounted closed, as every caller mounts it, so the figures it keeps come
    // from the prompt it was opened with.
    const view = render(dialog(null))
    view.rerender(dialog(prompt))

    // Approving clears the prompt and opens the wallet, but the dialog is
    // still on screen until its exit animation ends.
    view.rerender(dialog(null))

    expect(screen.getByText('−0.4 USDC')).toBeInTheDocument()
    expect(screen.getByText('2.5 USDC')).toBeInTheDocument()
    expect(screen.getByText(/approve this exact amount/)).toBeInTheDocument()
    // Answered already: a second tap must not answer whatever is asked next.
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()

    fireEvent.animationEnd(screen.getByRole('alertdialog'))
    expect(screen.queryByText('2.5 USDC')).not.toBeInTheDocument()

    // The next prompt shows its own figures, not the ones kept from the last.
    view.rerender(dialog({ ...prompt, permitValue: 3_100_000n }))
    expect(screen.getByText('3.1 USDC')).toBeInTheDocument()
  })
})
