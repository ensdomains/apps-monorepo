import '@testing-library/jest-dom'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { StablecoinBalance } from '@/lib/smart-account'
import { TokenPickerContentBase } from './TokenPickerContent'

i18n.loadAndActivate({ locale: 'en', messages: {} })

const usdc = {
  address: '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238',
  symbol: 'USDC',
  decimals: 6,
  balance: '1000000000',
} as unknown as StablecoinBalance

const dai = {
  address: '0xff34b3d4aee8ddcd6f9afffb6fe49bd371b8a357',
  symbol: 'DAI',
  decimals: 18,
  balance: '1000000000000000000000',
} as unknown as StablecoinBalance

const BASE_PROPS = {
  annualFee: 330,
  durationYears: 1,
  isConnected: true,
  isLoadingBalances: false,
  label: 'jeff',
  onNext: () => {},
  onSelectCoin: () => {},
  pricingData: 330,
  pricingLoading: false,
  selectedToken: undefined,
  stablecoinBalances: [usdc],
} as const satisfies Parameters<typeof TokenPickerContentBase>[0]

const renderPicker = (
  props: Partial<Parameters<typeof TokenPickerContentBase>[0]> = {},
) => {
  const onSelectCoin = vi.fn()
  render(
    <I18nProvider i18n={i18n}>
      <TokenPickerContentBase
        {...BASE_PROPS}
        onSelectCoin={onSelectCoin}
        {...props}
      />
    </I18nProvider>,
  )
  return onSelectCoin
}

describe('TokenPickerContentBase', () => {
  it('selects the only payment option automatically', () => {
    const onSelectCoin = renderPicker()

    expect(onSelectCoin).toHaveBeenCalledWith('USDC')
  })

  it('leaves the choice to the user when there is more than one option', () => {
    const onSelectCoin = renderPicker({ stablecoinBalances: [usdc, dai] })

    expect(onSelectCoin).not.toHaveBeenCalled()
  })

  it('does not override a token the user already picked', () => {
    const onSelectCoin = renderPicker({ selectedToken: 'USDC' })

    expect(onSelectCoin).not.toHaveBeenCalled()
  })

  it('waits for balances to load before selecting', () => {
    const onSelectCoin = renderPicker({
      isLoadingBalances: true,
      stablecoinBalances: [],
    })

    expect(onSelectCoin).not.toHaveBeenCalled()
  })

  it('does nothing when there are no balances', () => {
    const onSelectCoin = renderPicker({ stablecoinBalances: [] })

    expect(onSelectCoin).not.toHaveBeenCalled()
  })

  it('lets checkout through when the HCA already covers the whole budget', () => {
    // A debit of 0 is a real state, not a missing quote: an aborted
    // registration that funded the commit but never revealed leaves the HCA
    // holding the budget, and the retry owes the wallet nothing.
    renderPicker({
      funding: {
        registration: 330,
        networkFee: 0.196054,
        total: 330.196054,
        walletDebit: 0,
        hcaCredit: 330.196054,
      },
      selectedToken: 'USDC',
    })

    expect(screen.getByRole('button', { name: 'Register name' })).toBeEnabled()
  })

  it('tells the user when their last attempt already covers the registration', () => {
    // Otherwise a fully-funded HCA silently skips the approval prompt they saw
    // on the previous attempt, which reads as a step going missing.
    renderPicker({
      infoMessage:
        'What was left from your last attempt covers the 330.20 USDC this registration needs.',
      selectedToken: 'USDC',
    })

    expect(
      screen.getByText(/left from your last attempt covers the 330\.20 usdc/i),
    ).toBeInTheDocument()
  })

  it('suppresses the funded note when there is an error to show', () => {
    // "You are already funded" printed under a funding failure is a
    // contradiction, and the error is the actionable half.
    renderPicker({
      errorMessage: 'Not enough USDC.',
      infoMessage: 'What was left from your last attempt covers 100.00 USDC.',
      selectedToken: 'USDC',
    })

    expect(screen.getByText('Not enough USDC.')).toBeInTheDocument()
    expect(
      screen.queryByText(/left from your last attempt covers/i),
    ).not.toBeInTheDocument()
  })

  it('shows the leftover as a deduction and what the wallet pays now', () => {
    renderPicker({
      funding: {
        registration: 160,
        networkFee: 4.32,
        total: 164.32,
        walletDebit: 162.5,
        hcaCredit: 1.82,
      },
      selectedToken: 'USDC',
    })

    expect(screen.getByText('Registration fee')).toBeInTheDocument()
    expect(screen.getByText('$160.00')).toBeInTheDocument()
    // Every line carries a tooltip, so the three amounts share a column.
    expect(
      screen.getByRole('button', { name: 'What is the registration fee?' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Network fee')).toBeInTheDocument()
    expect(screen.getByText('Left from your last attempt')).toBeInTheDocument()
    expect(screen.getByText('-$1.82')).toBeInTheDocument()
    expect(screen.getByText('You pay now')).toBeInTheDocument()
    expect(screen.getByText('$162.50')).toBeInTheDocument()
    expect(screen.queryByText('Total')).not.toBeInTheDocument()
  })

  it('keeps the plain total when nothing is left from an earlier attempt', () => {
    renderPicker({
      funding: {
        registration: 160,
        networkFee: 4.32,
        total: 164.32,
        walletDebit: 164.32,
        hcaCredit: 0,
      },
      selectedToken: 'USDC',
    })

    expect(screen.getByText('Total')).toBeInTheDocument()
    expect(screen.getByText('$164.32')).toBeInTheDocument()
    expect(
      screen.queryByText('Left from your last attempt'),
    ).not.toBeInTheDocument()
  })

  // The rows are rounded to cents; the headline must be their sum, not the
  // raw total rounded on its own, or the sheet contradicts itself.
  it('shows a headline the rows add up to', () => {
    renderPicker({
      funding: {
        registration: 4.994,
        networkFee: 4.994,
        total: 9.988,
        walletDebit: 9.988,
        hcaCredit: 0,
      },
      selectedToken: 'USDC',
    })

    expect(screen.getAllByText('$4.99')).toHaveLength(2)
    expect(screen.getByText('$9.98')).toBeInTheDocument()
    expect(screen.queryByText('$9.99')).not.toBeInTheDocument()
  })

  // A failed quote used to take the whole card with it, so the sheet changed
  // shape under the user. Both lines stay; only the fee reads as unknown.
  it('keeps the breakdown when the fee could not be quoted', () => {
    renderPicker({
      hasFundingBudget: true,
      isFundingUnavailable: true,
      selectedToken: 'USDC',
    })

    expect(screen.getByText('Registration fee')).toBeInTheDocument()
    expect(screen.getByText('Network fee')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'What is the network fee?' }),
    ).toBeInTheDocument()
  })

  // The reported bug: a quote that lands, is refetched, or is refused made the
  // sheet change shape under the user. The lines are mounted once and stay.
  it('holds the breakdown through a quote that fails and then lands', () => {
    const props = {
      hasFundingBudget: true,
      selectedToken: 'USDC',
    } as const
    const { rerender } = render(
      <I18nProvider i18n={i18n}>
        <TokenPickerContentBase {...BASE_PROPS} {...props} />
      </I18nProvider>,
    )
    const quotingRow = screen.getByText('Registration fee')

    rerender(
      <I18nProvider i18n={i18n}>
        <TokenPickerContentBase
          {...BASE_PROPS}
          {...props}
          isFundingUnavailable
        />
      </I18nProvider>,
    )
    rerender(
      <I18nProvider i18n={i18n}>
        <TokenPickerContentBase
          {...BASE_PROPS}
          {...props}
          funding={{
            registration: 330,
            networkFee: 4.32,
            total: 334.32,
            walletDebit: 334.32,
            hcaCredit: 0,
          }}
        />
      </I18nProvider>,
    )

    expect(screen.getByText('Registration fee')).toBe(quotingRow)
    expect(screen.getByText('Network fee')).toBeInTheDocument()
    expect(screen.getByText('$4.32')).toBeInTheDocument()
  })

  // The figures belong to the previous toggle state until the re-quote lands,
  // and the machine refuses a permit that exceeds what was on screen.
  it('holds checkout while a stale quote is on screen', () => {
    renderPicker({
      funding: {
        registration: 160,
        networkFee: 4.32,
        total: 164.32,
        walletDebit: 164.32,
        hcaCredit: 0,
      },
      isQuoteStale: true,
      selectedToken: 'USDC',
    })

    expect(screen.getByRole('button', { name: 'Register name' })).toBeDisabled()
    // The sheet keeps its shape; only the button waits.
    expect(screen.getByText('$160.00')).toBeInTheDocument()
  })

  it('names where the balance sits, once', () => {
    renderPicker({ selectedToken: 'USDC' })

    expect(screen.getAllByText('in your wallet')).toHaveLength(1)
    expect(screen.queryByText('available')).not.toBeInTheDocument()
  })

  it('blocks checkout when the wallet cannot cover the debit', () => {
    // The 1,000 USDC balance covers the 330 rent but not the 2,000 debit —
    // gating on the debit is what makes this fail.
    renderPicker({
      funding: {
        registration: 1_999.803946,
        networkFee: 0.196054,
        total: 2_000,
        walletDebit: 2_000,
        hcaCredit: 0,
      },
      selectedToken: 'USDC',
    })

    expect(screen.getByRole('button', { name: 'Register name' })).toBeDisabled()
  })
})
