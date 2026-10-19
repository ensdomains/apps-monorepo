import '@testing-library/jest-dom'
import type { HcaFundingPrompt } from '@ens-apps/transaction-manager'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HcaFundingConfirmDialog } from './HcaFundingConfirmDialog'

i18n.loadAndActivate({ locale: 'en', messages: {} })

const renderDialog = (prompt: HcaFundingPrompt) =>
  render(
    <I18nProvider i18n={i18n}>
      <HcaFundingConfirmDialog
        description="Paid out of your smart account."
        onApprove={() => {}}
        onDecline={() => {}}
        prompt={prompt}
        title="Approve the payment?"
      />
    </I18nProvider>,
  )

const ONE_DAI = 10n ** 18n

describe('HcaFundingConfirmDialog', () => {
  it('shows what each token takes from the account and the wallet', () => {
    // Rent in DAI, fee in USDC: two amounts, so two approvals.
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
        unlimitedAllowance: true,
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
})
