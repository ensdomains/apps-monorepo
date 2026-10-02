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

const renderPicker = (
  props: Partial<Parameters<typeof TokenPickerContentBase>[0]> = {},
) => {
  const onSelectCoin = vi.fn()
  render(
    <I18nProvider i18n={i18n}>
      <TokenPickerContentBase
        isConnected
        isLoadingBalances={false}
        label="jeff"
        onNext={() => {}}
        onSelectCoin={onSelectCoin}
        pricingData={330}
        pricingLoading={false}
        selectedToken={undefined}
        stablecoinBalances={[usdc]}
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
        networkFee: 0.196054,
        total: 330.196054,
        walletDebit: 0,
        isLoading: false,
      },
      selectedToken: 'USDC',
    })

    expect(screen.getByRole('button', { name: 'Register name' })).toBeEnabled()
  })

  it('tells the user when their account already covers the registration', () => {
    // Otherwise a fully-funded HCA silently skips the approval prompt they saw
    // on the previous attempt, which reads as a step going missing.
    renderPicker({
      infoMessage:
        'Your account already holds the 330.20 USDC this registration needs.',
      selectedToken: 'USDC',
    })

    expect(
      screen.getByText(/your account already holds the 330\.20 usdc/i),
    ).toBeInTheDocument()
  })

  it('suppresses the funded note when there is an error to show', () => {
    // "You are already funded" printed under a funding failure is a
    // contradiction, and the error is the actionable half.
    renderPicker({
      errorMessage: 'Not enough USDC.',
      infoMessage: 'Your account already holds 100.00 USDC.',
      selectedToken: 'USDC',
    })

    expect(screen.getByText('Not enough USDC.')).toBeInTheDocument()
    expect(
      screen.queryByText(/your account already holds/i),
    ).not.toBeInTheDocument()
  })

  it('blocks checkout when the wallet cannot cover the debit', () => {
    // The 1,000 USDC balance covers the 330 rent but not the 2,000 debit —
    // gating on the debit is what makes this fail.
    renderPicker({
      funding: {
        networkFee: 0.196054,
        total: 2_000,
        walletDebit: 2_000,
        isLoading: false,
      },
      selectedToken: 'USDC',
    })

    expect(screen.getByRole('button', { name: 'Register name' })).toBeDisabled()
  })

  it('blocks checkout when the budget quote failed', () => {
    // Immunefi #93021: the wallet affords the 330 rent, but the rent is not
    // what the registration costs, so proceeding strands the commitment.
    renderPicker({ hasBudgetQuoteFailed: true, selectedToken: 'USDC' })

    expect(screen.getByRole('button', { name: 'Register name' })).toBeDisabled()
  })

  it('keeps the "up to" hedge when the budget quote failed', () => {
    // The total falls back to the rent — a lower bound, not an exact price.
    renderPicker({ hasBudgetQuoteFailed: true, selectedToken: 'USDC' })

    expect(screen.getByText('up to')).toBeInTheDocument()
  })

  it('leaves the EOA route alone, which has no budget to quote', () => {
    renderPicker({ selectedToken: 'USDC' })

    expect(screen.getByRole('button', { name: 'Register name' })).toBeEnabled()
    expect(screen.queryByText('up to')).not.toBeInTheDocument()
  })
})
