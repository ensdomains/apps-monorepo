import '@testing-library/jest-dom'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StablecoinBalance } from '@/lib/smart-account'
import {
  TokenPickerContent,
  TokenPickerContentBase,
} from './TokenPickerContent'

const containerMocks = vi.hoisted(() => ({
  renderBudget: null as {
    total: bigint
    registrationPrice: bigint
    hcaBalance: bigint
  } | null,
  revalidatedBudget: null as {
    total: bigint
    registrationPrice: bigint
    hcaBalance: bigint
  } | null,
  walletBalance: '100000000',
  availabilityError: null as Error | null,
  fetchCalls: 0,
}))

vi.mock('@xstate/react', () => ({
  useSelector: () => [31_536_000, 'USDC'] as const,
}))

vi.mock('../../../state/registrationUi.context', () => ({
  useRegistrationV2Context: () => ({
    label: 'jeff',
    uiActor: { send: vi.fn() },
  }),
}))

vi.mock('@/lib/smart-account/useSmartAccountBalances', () => ({
  HCA_PAYMENT_TOKEN: '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238',
}))

vi.mock('@/lib/smart-account/SmartAccountContext', () => ({
  useSmartAccountContext: () => ({
    accountAddress: '0x0000000000000000000000000000000000000001',
    ownerAddress: null,
    signer: { type: 'rhinestone' },
    stablecoinBalances: [
      {
        address: '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238',
        symbol: 'USDC',
        decimals: 6,
        balance: containerMocks.walletBalance,
      },
    ],
    isLoadingBalances: false,
    isConnected: true,
    getSessionEnablePayload: vi.fn().mockResolvedValue(undefined),
  }),
}))

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => vi.fn(),
}))

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const React = await import('react')
  return {
    ...(await importOriginal<typeof import('@tanstack/react-query')>()),
    useQuery: (options: {
      queryKey?: unknown
      select?: (value: unknown) => unknown
    }) => {
      const key = JSON.stringify(options.queryKey)
      if (key.includes('get-register-price')) {
        const raw = { basePrice: 100_000_000n, premium: 0n }
        return {
          data: options.select ? options.select(raw) : raw,
          isLoading: false,
        }
      }
      if (key.includes('hca-budget')) {
        return {
          data: containerMocks.renderBudget,
          isError: false,
          isLoading: false,
          isFetching: false,
          isPlaceholderData: false,
        }
      }
      return { data: undefined, isLoading: false }
    },
    useQueryClient: () => ({
      fetchQuery: async () => {
        containerMocks.fetchCalls += 1
        if (containerMocks.fetchCalls === 1) {
          return containerMocks.revalidatedBudget
        }
        if (containerMocks.availabilityError) {
          throw containerMocks.availabilityError
        }
        return { isAvailable: true }
      },
    }),
    useMutation: (options: { mutationFn: () => Promise<unknown> }) => {
      const [error, setError] = React.useState<Error | null>(null)
      return {
        error,
        isError: error !== null,
        mutate: () => void options.mutationFn().catch(setError),
      }
    },
  }
})

i18n.loadAndActivate({ locale: 'en', messages: {} })

const usdc = {
  address: '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238',
  symbol: 'USDC',
  decimals: 6,
  balance: '1000000000',
} as unknown as StablecoinBalance

const emptyUsdc = {
  ...usdc,
  balance: '0',
} as unknown as StablecoinBalance

const secondUsdc = {
  ...usdc,
  address: '0x0000000000000000000000000000000000000002',
} as unknown as StablecoinBalance

const insufficientDai = {
  ...usdc,
  address: '0x0000000000000000000000000000000000000003',
  symbol: 'DAI',
  balance: '0',
} as unknown as StablecoinBalance

const renderContainer = () =>
  render(
    <I18nProvider i18n={i18n}>
      <TokenPickerContent />
    </I18nProvider>,
  )

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
        showNetworkFeeDetails
        stablecoinBalances={[usdc]}
        {...props}
      />
    </I18nProvider>,
  )
  return onSelectCoin
}

describe('TokenPickerContent', () => {
  beforeEach(() => {
    containerMocks.renderBudget = null
    containerMocks.revalidatedBudget = null
    containerMocks.walletBalance = '100000000'
    containerMocks.availabilityError = null
    containerMocks.fetchCalls = 0
  })

  const captureRevalidatedNamePriceError = async () => {
    containerMocks.revalidatedBudget = {
      total: 999_000_000n,
      registrationPrice: 999_000_000n,
      hcaBalance: 0n,
    }
    const view = renderContainer()
    fireEvent.click(screen.getByRole('button', { name: 'Register name' }))
    await screen.findByText('$999.00 needed to register name')
    return view
  }

  it('prefers a render-time network-fee shortfall to a revalidated name-price error', async () => {
    const view = await captureRevalidatedNamePriceError()
    containerMocks.renderBudget = {
      total: 200_000_000n,
      registrationPrice: 100_000_000n,
      hcaBalance: 0n,
    }

    view.rerender(
      <I18nProvider i18n={i18n}>
        <TokenPickerContent />
      </I18nProvider>,
    )

    expect(
      screen.getByText('not enough funds to pay network fees'),
    ).toBeVisible()
    expect(
      screen.queryByText('$999.00 needed to register name'),
    ).not.toBeInTheDocument()
  })

  it('uses the render-time wallet debit for a name-price shortfall', async () => {
    const view = await captureRevalidatedNamePriceError()
    containerMocks.renderBudget = {
      total: 200_000_000n,
      registrationPrice: 200_000_000n,
      hcaBalance: 0n,
    }

    view.rerender(
      <I18nProvider i18n={i18n}>
        <TokenPickerContent />
      </I18nProvider>,
    )

    expect(screen.getByText('$200.00 needed to register name')).toBeVisible()
    expect(
      screen.queryByText('$999.00 needed to register name'),
    ).not.toBeInTheDocument()
  })

  it('falls back to the revalidated name-price amount without a render-time shortfall', async () => {
    await captureRevalidatedNamePriceError()

    expect(screen.getByText('$999.00 needed to register name')).toBeVisible()
    expect(
      screen.queryByText('not enough funds to pay network fees'),
    ).not.toBeInTheDocument()
  })

  it('keeps a non-funding mutation failure global only', async () => {
    containerMocks.availabilityError = new Error('availability failed')
    renderContainer()
    fireEvent.click(screen.getByRole('button', { name: 'Register name' }))

    const error = await screen.findByText(
      "We couldn't confirm that jeff.eth is still available. Please try again.",
    )
    expect(error).toBeVisible()
    expect(error.closest('[data-slot="payment-method-error"]')).toBeNull()
    await waitFor(() =>
      expect(
        screen.queryByText(/needed to register name|pay network fees/),
      ).not.toBeInTheDocument(),
    )
  })
})

describe('TokenPickerContentBase', () => {
  it('selects the only payment option automatically', () => {
    const onSelectCoin = renderPicker()

    expect(onSelectCoin).toHaveBeenCalledWith('USDC')
  })

  it('leaves the choice to the user when there is more than one supplied balance', () => {
    const onSelectCoin = renderPicker({
      stablecoinBalances: [usdc, secondUsdc],
    })

    expect(onSelectCoin).not.toHaveBeenCalled()
  })

  it('keeps the existing token row outside registration', () => {
    renderPicker({
      selectedToken: 'USDC',
      showNetworkFeeDetails: false,
      stablecoinBalances: [usdc, insufficientDai],
    })

    expect(screen.getAllByText('in your wallet')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Select DAI' })).toBeDisabled()
    expect(
      screen.queryByRole('button', { name: /Load/ }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('balance')).not.toBeInTheDocument()
    expect(screen.queryByText(/Mainnet est\. fee/)).not.toBeInTheDocument()
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

    expect(screen.getByText('Name price')).toBeVisible()
    expect(screen.getByText('$160.00')).toBeVisible()
    expect(screen.getByText('Mainnet est. fee: $4.32')).toBeVisible()
    expect(screen.queryByText('Network fee')).not.toBeInTheDocument()
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

  it('moves the exact fee disclosure and balance label onto USDC', () => {
    renderPicker({
      funding: {
        registration: 325.68,
        networkFee: 4.32,
        total: 330,
        walletDebit: 330,
        hcaCredit: 0,
        isLoading: false,
      },
      selectedToken: 'USDC',
    })

    expect(screen.getByText('balance')).toBeVisible()
    expect(screen.queryByText('in your wallet')).not.toBeInTheDocument()
    expect(screen.getByText('Mainnet est. fee: $4.32')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'What is the network fee?' }),
    ).toBeVisible()
    expect(screen.queryByText('Network fee')).not.toBeInTheDocument()
  })

  it('keeps fee quote loading on the affected method', () => {
    renderPicker({
      isQuotingFunding: true,
      selectedToken: 'USDC',
    })

    const fee = screen.getByText('Mainnet est. fee: —')
    expect(fee).toBeVisible()
    expect(fee.parentElement).toHaveClass('animate-pulse')
    expect(screen.queryByText('Network fee')).not.toBeInTheDocument()
  })

  it('leaves the EOA route alone when there is no budget to quote', () => {
    renderPicker({ selectedToken: 'USDC' })

    expect(screen.getByText('Mainnet est. fee: —')).toBeVisible()
    expect(screen.getByText('$330.00')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Register name' })).toBeEnabled()
    expect(screen.queryByText('up to')).not.toBeInTheDocument()
  })

  it('blocks checkout when the required budget quote failed', () => {
    renderPicker({ hasBudgetQuoteFailed: true, selectedToken: 'USDC' })

    expect(screen.getByRole('button', { name: 'Register name' })).toBeDisabled()
    expect(screen.getByText('up to')).toBeVisible()
  })

  it('holds checkout while a stale quote is on screen', () => {
    renderPicker({
      funding: {
        registration: 160,
        networkFee: 4.32,
        total: 164.32,
        walletDebit: 164.32,
        hcaCredit: 0,
        isLoading: false,
      },
      isQuoteStale: true,
      selectedToken: 'USDC',
    })

    expect(screen.getByRole('button', { name: 'Register name' })).toBeDisabled()
    expect(screen.getByText('Mainnet est. fee: $4.32')).toBeVisible()
  })

  it('suppresses a funded note when there is a global error', () => {
    renderPicker({
      globalErrorMessage: 'Could not quote the registration.',
      infoMessage: 'What was left from your last attempt covers the cost.',
      selectedToken: 'USDC',
    })

    expect(screen.getByText('Could not quote the registration.')).toBeVisible()
    expect(
      screen.queryByText(/left from your last attempt covers/i),
    ).not.toBeInTheDocument()
  })

  it('shows the name-price target when an unquoted wallet is empty', () => {
    renderPicker({
      selectedToken: 'USDC',
      stablecoinBalances: [emptyUsdc],
    })

    const error = screen.getByText('$330.00 needed to register name')
    expect(error).toBeVisible()
    expect(error.closest('[data-slot="payment-method-error"]')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Register name' })).toBeDisabled()
  })

  it.each([
    '$2,000.00 needed to register name',
    'not enough funds to pay network fees',
  ])('keeps "%s" local to the affected method', (methodErrorMessage) => {
    renderPicker({
      funding: {
        registration: 1_999.8,
        networkFee: 0.2,
        total: 2_000,
        walletDebit: 2_000,
        hcaCredit: 0,
        isLoading: false,
      },
      methodErrorMessage,
      selectedToken: 'USDC',
    })

    const error = screen.getByText(methodErrorMessage)
    expect(error).toBeVisible()
    expect(error.closest('[data-slot="payment-method-error"]')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Register name' })).toBeDisabled()
  })

  it('keeps availability failure global', () => {
    renderPicker({
      globalErrorMessage:
        "We couldn't confirm that jeff.eth is still available. Please try again.",
      selectedToken: 'USDC',
    })

    const error = screen.getByText(
      "We couldn't confirm that jeff.eth is still available. Please try again.",
    )
    expect(error).toBeVisible()
    expect(error.closest('[data-slot="payment-method-error"]')).toBeNull()
  })

  // Six-decimal USDC: preserving the visible 1.01 credit requires the
  // displayed fee to absorb one cent so the lines still close.
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

    expect(screen.getByText('-$1.01')).toBeVisible()
    expect(screen.getByText('Mainnet est. fee: $1.01')).toBeVisible()
    expect(screen.getAllByText('$1.00').length).toBeGreaterThanOrEqual(2)
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
      screen.queryByText('Left from your last attempt'),
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/^--/)).not.toBeInTheDocument()
    expect(screen.getByText('Total')).toBeVisible()
    // The headline is still what the wallet pays, not the total.
    expect(screen.getByText('$9.99')).toBeVisible()
  })

  it('does not show a credit row for a real balance under a cent', () => {
    renderPicker({
      funding: {
        registration: 4.996,
        networkFee: 4.996,
        total: 9.992,
        walletDebit: 9.988,
        hcaCredit: 0.004,
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

  it('keeps a visible cent of credit and closes the displayed equation', () => {
    renderPicker({
      funding: {
        registration: 4.994,
        networkFee: 4.994,
        total: 9.988,
        walletDebit: 9.978,
        hcaCredit: 0.01,
        isLoading: false,
      },
      selectedToken: 'USDC',
    })

    expect(screen.getByText('Name price')).toBeVisible()
    expect(screen.getByText('$4.99')).toBeVisible()
    expect(screen.getByText('Mainnet est. fee: $5.00')).toBeVisible()
    expect(screen.getByText('Left from your last attempt')).toBeVisible()
    expect(screen.getByText('-$0.01')).toBeVisible()
    expect(screen.getByText('You pay now')).toBeVisible()
    expect(screen.getByText('$9.98')).toBeVisible()
  })

  it('keeps displayed charges nonnegative when the fee cannot absorb the residue', () => {
    renderPicker({
      funding: {
        registration: 14.277073,
        networkFee: 0.001508,
        total: 14.278581,
        walletDebit: 6.304178,
        hcaCredit: 7.974403,
        isLoading: false,
      },
      selectedToken: 'USDC',
    })

    expect(screen.getByText('Name price')).toBeVisible()
    expect(screen.getByText('$14.27')).toBeVisible()
    expect(screen.getByText('Mainnet est. fee: $0.00')).toBeVisible()
    expect(screen.getByText('-$7.97')).toBeVisible()
    expect(screen.getByText('You pay now')).toBeVisible()
    expect(screen.getByText('$6.30')).toBeVisible()
  })

  it('matches formatter half-up cents when there is no visible credit', () => {
    renderPicker({
      funding: {
        registration: 1,
        networkFee: 0.145,
        total: 1.145,
        walletDebit: 1.145,
        hcaCredit: 0,
        isLoading: false,
      },
      selectedToken: 'USDC',
    })

    expect(screen.getByText('Mainnet est. fee: $0.15')).toBeVisible()
    expect(screen.queryByText('Name price')).not.toBeInTheDocument()
    expect(screen.queryByText('You pay now')).not.toBeInTheDocument()
    expect(screen.getByText('Total')).toBeVisible()
    expect(screen.getByText('$1.15')).toBeVisible()
  })

  it('matches formatter half-up cents and closes the credited equation', () => {
    renderPicker({
      funding: {
        registration: 1.005,
        networkFee: 0.14,
        total: 1.145,
        walletDebit: 1,
        hcaCredit: 0.145,
        isLoading: false,
      },
      selectedToken: 'USDC',
    })

    expect(screen.getByText('Name price')).toBeVisible()
    expect(screen.getByText('$1.01')).toBeVisible()
    expect(screen.getByText('Mainnet est. fee: $0.14')).toBeVisible()
    expect(screen.getByText('-$0.15')).toBeVisible()
    expect(screen.getByText('You pay now')).toBeVisible()
    expect(screen.getByText('$1.00')).toBeVisible()
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
