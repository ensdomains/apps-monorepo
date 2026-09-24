import '@testing-library/jest-dom'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { StablecoinBalance } from '@/lib/smart-account'
import {
  startRegistrationWithSession,
  startSingleRegistrationAttempt,
  TokenPickerContentBase,
} from './TokenPickerContent'

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
        showRegistrationFee
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

  it('keeps DAI selectable while USDC owns the network-fee disclosure', () => {
    const onSelectCoin = renderPicker({
      funding: {
        registration: 495.68,
        networkFee: 4.32,
        total: 500,
        walletDebit: 500,
        hcaCredit: 0,
        isUnderfunded: true,
        isLoading: false,
      },
      stablecoinBalances: [
        { ...usdc, balance: '100000000' } as StablecoinBalance,
        dai,
      ],
    })

    expect(screen.getByRole('button', { name: 'Select USDC' })).toBeDisabled()
    const daiOption = screen.getByRole('button', { name: 'Select DAI' })
    expect(daiOption).toBeEnabled()
    expect(
      daiOption.querySelector(
        '[data-slot="payment-method-token-icon"] path[fill="#F5AC37"]',
      ),
    ).toBeInTheDocument()
    expect(
      daiOption.querySelector('[data-slot="payment-method-network-icon"]'),
    ).toBeVisible()
    expect(screen.getAllByText('Mainnet est. fee:')).toHaveLength(1)
    expect(
      screen.getAllByText('not enough funds to pay network fees'),
    ).toHaveLength(1)

    act(() => daiOption.click())
    expect(onSelectCoin).toHaveBeenCalledWith('DAI')
  })

  it('keeps an unavailable USDC row unselected beside a funded selection', () => {
    renderPicker({
      funding: {
        registration: 495.68,
        networkFee: 4.32,
        total: 500,
        walletDebit: 500,
        hcaCredit: 0,
        isUnderfunded: true,
        isLoading: false,
      },
      selectedToken: 'DAI',
      stablecoinBalances: [
        { ...usdc, balance: '100000000' } as StablecoinBalance,
        dai,
      ],
    })

    const usdcRow = screen
      .getByRole('button', { name: 'Select USDC' })
      .closest('[data-slot="payment-method-row"]')
    const daiRow = screen
      .getByRole('button', { name: 'Select DAI' })
      .closest('[data-slot="payment-method-row"]')
    const error = screen
      .getByText('not enough funds to pay network fees')
      .closest('[data-slot="payment-method-error"]')
    const unavailableBalance = usdcRow?.querySelector(
      '[data-slot="payment-method-balance"]',
    )
    const unavailableIcon = usdcRow?.querySelector(
      '[data-slot="payment-method-token-icon"]',
    )
    const unavailableDetails = usdcRow?.querySelector(
      '[data-slot="payment-method-details"]',
    )

    expect(usdcRow).toHaveClass(
      'grid',
      'content-start',
      'items-start',
      'sm:px-4',
      'sm:py-3',
    )
    expect(usdcRow).not.toHaveClass(
      'min-h-17',
      'sm:min-h-[63px]',
      'sm:min-h-[77px]',
      'sm:bg-ens-quartz-70',
    )
    expect(daiRow).toHaveClass(
      'grid',
      'content-start',
      'items-start',
      'sm:bg-ens-quartz-70',
      'sm:p-3',
    )
    expect(daiRow).not.toHaveClass(
      'min-h-17',
      'sm:min-h-[63px]',
      'sm:min-h-[77px]',
    )
    expect(unavailableIcon).toHaveClass('opacity-30')
    expect(unavailableDetails).not.toHaveClass('opacity-50')
    expect(unavailableBalance?.firstElementChild).toHaveClass(
      'sm:text-black/30',
      'sm:text-[15px]',
      'sm:font-[450]',
      'sm:leading-[22px]',
    )
    expect(unavailableBalance?.lastElementChild).toHaveClass(
      'sm:text-ens-quartz-400',
      'sm:font-[360]',
      'sm:leading-[normal]',
    )
    expect(error).toHaveClass(
      'col-span-2',
      'col-start-1',
      'gap-0.5',
      'justify-self-stretch',
      'whitespace-nowrap',
      'pl-9',
      'text-left',
      'text-ens-signal-danger-500',
      'leading-[normal]',
      'sm:pl-[46px]',
    )
    expect(error).not.toHaveClass('h-[15px]', 'sm:h-[17px]')
    const errorIcon = error?.querySelector('.material-symbol')
    expect(errorIcon).toHaveClass('inline-block', 'shrink-0')
    expect(errorIcon).not.toHaveClass('hidden', 'sm:hidden')
    expect(errorIcon).toHaveTextContent('flash_off')
  })

  it('does not gate unselected DAI with the USDC quote', () => {
    const onSelectCoin = renderPicker({
      selectedToken: 'USDC',
      stablecoinBalances: [
        usdc,
        {
          ...dai,
          balance: '329500000000000000000',
        } as StablecoinBalance,
      ],
    })

    const daiOption = screen.getByRole('button', { name: 'Select DAI' })
    expect(daiOption).toBeEnabled()

    act(() => daiOption.click())
    expect(onSelectCoin).toHaveBeenCalledWith('DAI')
  })

  it('uses the generic USDC row outside registration', () => {
    renderPicker({ showRegistrationFee: false })

    expect(screen.queryByText('Mainnet est. fee:')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'What is the network fee?' }),
    ).not.toBeInTheDocument()
  })

  it('gates DAI on its own price instead of the USDC funding budget', () => {
    renderPicker({
      funding: {
        registration: 495.68,
        networkFee: 4.32,
        total: 500,
        walletDebit: 500,
        hcaCredit: 0,
        isUnderfunded: true,
        isLoading: false,
      },
      selectedToken: 'DAI',
      stablecoinBalances: [
        { ...usdc, balance: '100000000' } as StablecoinBalance,
        { ...dai, balance: '330000000000000000000' } as StablecoinBalance,
      ],
    })

    expect(screen.getByRole('button', { name: 'Register name' })).toBeEnabled()
    expect(screen.getAllByText('$330.00')).toHaveLength(2)
    expect(screen.queryByText('$500.00')).not.toBeInTheDocument()
    expect(screen.queryByText('up to')).not.toBeInTheDocument()
    const acceptedStables = screen.getByRole('list', {
      name: 'Stables accepted',
    })
    expect(acceptedStables).toContainElement(
      screen.getByRole('listitem', { name: 'USDC' }),
    )
    expect(acceptedStables).toContainElement(
      screen.getByRole('listitem', { name: 'DAI' }),
    )
  })

  it('uses the shared intrinsic error row for an insufficient DAI balance', () => {
    renderPicker({
      funding: {
        registration: 347.68,
        networkFee: 4.32,
        total: 352,
        walletDebit: 352,
        hcaCredit: 0,
        isUnderfunded: false,
        isLoading: false,
      },
      pricingData: 352,
      selectedToken: 'DAI',
      stablecoinBalances: [
        usdc,
        { ...dai, balance: '5000000000000000000' } as StablecoinBalance,
      ],
    })

    const daiOption = screen.getByRole('button', { name: 'Select DAI' })
    const error = screen
      .getByText('Need $352.00')
      .closest('[data-slot="payment-method-error"]')
    const balance = daiOption.querySelector(
      '[data-slot="payment-method-balance"]',
    )

    expect(daiOption).toBeDisabled()
    expect(error).not.toBeNull()
    expect(daiOption).toHaveAttribute('aria-describedby', error?.id)
    expect(daiOption).toHaveClass(
      'grid',
      'grid-cols-[minmax(0,1fr)_auto]',
      'content-start',
      'items-start',
    )
    expect(daiOption).not.toHaveClass(
      'min-h-17',
      'sm:min-h-[63px]',
      'sm:min-h-[77px]',
    )
    expect(daiOption.firstElementChild).toHaveClass('items-start')
    expect(balance?.lastElementChild).toHaveTextContent('balance')
    expect(error).toHaveClass(
      'col-span-2',
      'col-start-1',
      'gap-0.5',
      'justify-self-stretch',
      'whitespace-nowrap',
      'pl-9',
      'text-left',
      'text-ens-signal-danger-500',
      'leading-[normal]',
      'sm:pl-[46px]',
    )
    expect(error).not.toHaveClass('h-[15px]', 'sm:h-[17px]')
    const errorIcon = error?.querySelector('.material-symbol')
    expect(errorIcon).toHaveClass('inline-block', 'shrink-0')
    expect(errorIcon).not.toHaveClass('hidden', 'sm:hidden')
    expect(errorIcon).toHaveTextContent('flash_off')
    expect(
      screen.queryByText('not enough funds to pay network fees'),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Register name' })).toBeDisabled()
  })

  it('does not override a token the user already picked', () => {
    const onSelectCoin = renderPicker({ selectedToken: 'USDC' })

    expect(onSelectCoin).not.toHaveBeenCalled()
  })

  it('disables registration while an attempt is pending', () => {
    renderPicker({ isSubmitting: true, selectedToken: 'USDC' })

    expect(screen.getByRole('button', { name: 'Register name' })).toBeDisabled()
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
        isUnderfunded: false,
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
        isUnderfunded: true,
        isLoading: false,
      },
      selectedToken: 'USDC',
    })

    expect(screen.getByRole('button', { name: 'Register name' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Select USDC' })).toBeDisabled()
    expect(
      screen.getByText('not enough funds to pay network fees'),
    ).toBeVisible()
    expect(screen.queryByText(/^Not enough USDC/)).not.toBeInTheDocument()
  })

  it('ignores a stale click-time funding error after funding recovers', () => {
    renderPicker({
      funding: {
        registration: 160,
        networkFee: 4.32,
        total: 164.32,
        walletDebit: 164.32,
        hcaCredit: 0,
        isUnderfunded: false,
        isLoading: false,
      },
      hasInsufficientFundingError: true,
      selectedToken: 'USDC',
    })

    expect(screen.getByRole('button', { name: 'Register name' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Select USDC' })).toBeEnabled()
    expect(
      screen.queryByText('not enough funds to pay network fees'),
    ).not.toBeInTheDocument()
  })

  it('shows the funded USDC balance, fee, and fee help on the method', async () => {
    renderPicker({
      funding: {
        registration: 160,
        networkFee: 4.32,
        total: 164.32,
        walletDebit: 164.32,
        hcaCredit: 0,
        isUnderfunded: false,
        isLoading: false,
      },
      selectedToken: 'USDC',
    })

    const method = screen
      .getByRole('button', { name: 'Select USDC' })
      .closest('[data-slot="payment-method-row"]')
    const details = method?.querySelector(
      '[data-slot="payment-method-details"]',
    )
    const balance = method?.querySelector(
      '[data-slot="payment-method-balance"]',
    )
    const paymentList = method?.closest('[data-slot="payment-method-list"]')
    const tokenIcon = method?.querySelector(
      '[data-slot="payment-method-token-icon"]',
    )
    const networkIcon = method?.querySelector(
      '[data-slot="payment-method-network-icon"]',
    )

    expect(paymentList).toHaveClass(
      'w-full',
      'gap-3',
      'sm:w-[454px]',
      'sm:gap-0',
    )
    expect(method).toBeVisible()
    expect(method).toHaveClass(
      'grid',
      'content-start',
      'items-start',
      'sm:bg-ens-quartz-70',
      'sm:p-3',
    )
    expect(method).not.toHaveClass(
      'min-h-17',
      'sm:min-h-[63px]',
      'sm:min-h-[77px]',
    )
    expect(screen.getByRole('button', { name: 'Select USDC' })).toHaveClass(
      'items-start',
    )
    expect(tokenIcon).toHaveClass('sm:size-8.5')
    expect(networkIcon).toHaveClass('sm:size-4', 'sm:-right-1', 'sm:-bottom-1')
    expect(details).toContainElement(screen.getByText('Mainnet est. fee:'))
    expect(details).toContainElement(screen.getByText('$4.32'))
    expect(details?.firstElementChild).toHaveClass(
      'text-sm',
      'sm:text-black',
      'sm:leading-[normal]',
    )
    expect(balance).toContainElement(screen.getByText('$1,000.00'))
    expect(balance?.firstElementChild).toHaveClass(
      'sm:text-[15px]',
      'sm:font-[450]',
      'sm:leading-[22px]',
      'sm:text-black',
    )
    expect(balance).toContainElement(screen.getByText('balance'))
    expect(networkIcon).toBeVisible()
    expect(networkIcon?.tagName).toBe('IMG')
    expect(screen.queryByText('Network fee')).not.toBeInTheDocument()
    expect(screen.queryByText(/Load more/i)).not.toBeInTheDocument()

    const feeHelp = screen.getByRole('button', {
      name: 'What is the network fee?',
    })
    act(() => feeHelp.focus())
    const tooltipCopy = await screen.findAllByText(
      'An estimate of what the two on-chain transactions that register your name will cost. It is collected together with the name price, in the same approval.',
    )
    expect(tooltipCopy[0]).toBeVisible()
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
        isUnderfunded: false,
        isLoading: false,
      },
      selectedToken: 'USDC',
    })

    expect(screen.getByText('Name price')).toBeVisible()
    expect(screen.getByText('$160.00')).toBeVisible()
    expect(screen.getByText('Left from your last attempt')).toBeVisible()
    expect(screen.getByText('-$1.82')).toBeVisible()
    expect(screen.getByText('You pay now')).toBeVisible()
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
        isUnderfunded: false,
        isLoading: false,
      },
      selectedToken: 'USDC',
    })

    expect(screen.getByText('Total')).toBeVisible()
    expect(screen.getByText('$164.32')).toBeVisible()
    expect(
      screen.queryByText('Left from your last attempt'),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('You pay now')).not.toBeInTheDocument()
    expect(screen.queryByText('Name price')).not.toBeInTheDocument()
  })

  it('uses the approved balance label', () => {
    renderPicker({ selectedToken: 'USDC' })

    expect(screen.getByText('balance')).toBeVisible()
    expect(screen.queryByText('in your wallet')).not.toBeInTheDocument()
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
        isUnderfunded: false,
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
        isUnderfunded: false,
        isLoading: false,
      },
      selectedToken: 'USDC',
    })

    expect(
      screen.queryByText('Left from your last attempt'),
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/^--/)).not.toBeInTheDocument()
    expect(screen.getByText('Total')).toBeVisible()
    // The headline is still what the wallet pays, not the total.
    expect(screen.getByText('$9.99')).toBeVisible()
  })

  // Rounding can leave a cent over on an empty account; a credit line there
  // would be money the user does not have.
  it('shows no credit for an account that is empty', () => {
    renderPicker({
      funding: {
        registration: 4.996,
        networkFee: 4.996,
        total: 9.992,
        walletDebit: 9.992,
        hcaCredit: 0,
        isUnderfunded: false,
        isLoading: false,
      },
      selectedToken: 'USDC',
    })

    expect(
      screen.queryByText('Left from your last attempt'),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('You pay now')).not.toBeInTheDocument()
    expect(screen.getByText('Total')).toBeVisible()
  })
})

describe('startRegistrationWithSession', () => {
  it('requires the session gate before starting with USDC', () => {
    const gate = vi.fn()
    const onStart = vi.fn()
    const attempt = {
      token: 'USDC' as const,
      pricing: {
        basePriceNumber: 329,
        premiumPriceNumber: 1,
        totalPriceNumber: 330,
        rawPrice: 330_000_000n,
      },
    }

    startRegistrationWithSession({ attempt, gate, onStart })

    expect(onStart).not.toHaveBeenCalled()
    const onProceed = gate.mock.calls[0]?.[0]
    expect(onProceed).toBeTypeOf('function')
    onProceed?.()
    expect(onStart).toHaveBeenCalledWith(attempt)
  })

  it('starts with DAI without requiring a session', () => {
    const gate = vi.fn()
    const onStart = vi.fn()
    const attempt = {
      token: 'DAI' as const,
      pricing: {
        basePriceNumber: 329,
        premiumPriceNumber: 0,
        totalPriceNumber: 329,
        rawPrice: 329_000_000_000_000_000_000n,
      },
    }

    startRegistrationWithSession({ attempt, gate, onStart })

    expect(gate).not.toHaveBeenCalled()
    expect(onStart).toHaveBeenCalledWith(attempt)
  })
})

describe('startSingleRegistrationAttempt', () => {
  it('ignores concurrent attempts until the active attempt settles', () => {
    const attempt = {
      token: 'USDC' as const,
      pricing: {
        basePriceNumber: 329,
        premiumPriceNumber: 1,
        totalPriceNumber: 330,
        rawPrice: 330_000_000n,
      },
    }
    const inFlight = { current: false }
    const onStart = vi.fn()

    startSingleRegistrationAttempt({ attempt, inFlight, onStart })
    startSingleRegistrationAttempt({ attempt, inFlight, onStart })

    expect(onStart).toHaveBeenCalledOnce()
    onStart.mock.calls[0]?.[1]()
    startSingleRegistrationAttempt({ attempt, inFlight, onStart })
    expect(onStart).toHaveBeenCalledTimes(2)
  })
})
