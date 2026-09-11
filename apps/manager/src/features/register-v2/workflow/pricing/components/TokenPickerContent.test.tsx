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
        registration: 330,
        networkFee: 0.196054,
        total: 330.196054,
        walletDebit: 0,
        hcaCredit: 330.196054,
        isLoading: false,
      },
      selectedToken: 'USDC',
    })

    expect(screen.getByRole('button', { name: 'Register name' })).toBeEnabled()
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
        isLoading: false,
      },
      selectedToken: 'USDC',
    })

    expect(screen.getByRole('button', { name: 'Register name' })).toBeDisabled()
  })

  // The sheet quotes a wallet balance too, so a second balance described in a
  // sentence read as the first one contradicting itself (Laura, 2026-09-08).
  it('puts the account credit on its own line and bills the wallet the rest', () => {
    renderPicker({
      funding: {
        registration: 160,
        networkFee: 4.32,
        total: 164.32,
        walletDebit: 162.5,
        hcaCredit: 1.82,
        isLoading: false,
      },
      selectedToken: 'USDC',
    })

    expect(screen.getByText('Registration')).toBeVisible()
    expect(screen.getByText('$160.00')).toBeVisible()
    expect(screen.getByText('Already in your ENS account')).toBeVisible()
    expect(screen.getByText('-$1.82')).toBeVisible()
    expect(screen.getByText('From your wallet')).toBeVisible()
    expect(screen.getByText('$162.50')).toBeVisible()
    expect(screen.queryByText('Total')).not.toBeInTheDocument()
    expect(screen.queryByText('$164.32')).not.toBeInTheDocument()
  })

  it('keeps a single total when the account carries nothing', () => {
    renderPicker({
      funding: {
        registration: 160,
        networkFee: 4.32,
        total: 164.32,
        walletDebit: 164.32,
        hcaCredit: 0,
        isLoading: false,
      },
      selectedToken: 'USDC',
    })

    expect(screen.getByText('Total')).toBeVisible()
    expect(screen.getByText('$164.32')).toBeVisible()
    expect(
      screen.queryByText('Already in your ENS account'),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('From your wallet')).not.toBeInTheDocument()
    expect(screen.queryByText('Registration')).not.toBeInTheDocument()
  })

  it('says whose balance the token row is showing', () => {
    renderPicker({ selectedToken: 'USDC' })

    expect(screen.getByText('in your wallet')).toBeVisible()
    expect(screen.queryByText('available')).not.toBeInTheDocument()
  })

  // Six-decimal USDC: rounding each figure on its own would print
  // 1.00 + 1.00 - 1.01 against a 1.00 debit.
  it('keeps the credited lines adding up to the headline', () => {
    renderPicker({
      funding: {
        registration: 1.004,
        networkFee: 1.004,
        total: 2.008,
        walletDebit: 1,
        hcaCredit: 1.008,
        isLoading: false,
      },
      selectedToken: 'USDC',
    })

    expect(screen.getByText('-$1.00')).toBeVisible()
    expect(screen.queryByText('-$1.01')).not.toBeInTheDocument()
    expect(screen.getAllByText('$1.00').length).toBeGreaterThanOrEqual(3)
  })

  // A balance under a cent: the deduction would print as "--$0.01", money the
  // account actually holds shown as a charge.
  it('leaves a sub-cent balance off the sheet', () => {
    renderPicker({
      funding: {
        registration: 4.994,
        networkFee: 4.994,
        total: 9.988,
        walletDebit: 9.987,
        hcaCredit: 0.001,
        isLoading: false,
      },
      selectedToken: 'USDC',
    })

    expect(
      screen.queryByText('Already in your ENS account'),
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/^--/)).not.toBeInTheDocument()
    expect(screen.getByText('Total')).toBeVisible()
    // The headline is still what the wallet pays, not the total.
    expect(screen.getByText('$9.99')).toBeVisible()
  })
})
