import '@testing-library/jest-dom'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StablecoinBalance } from '@/lib/smart-account'
import { HCA_PAYMENT_TOKEN } from '@/lib/smart-account/useSmartAccountBalances'
import {
  TokenPickerContent,
  TokenPickerContentBase,
} from './TokenPickerContent'

const integration = vi.hoisted(() => ({
  testId: 0,
  isBudgetEnabled: true,
  pricingRaw: 8_000_000n,
  walletBalanceRaw: 5_000_000n,
  budget: {
    registrationPrice: 8_000_000n,
    total: 20_196_054n,
    hcaBalance: 0n,
  },
  send: vi.fn(),
  navigate: vi.fn(),
  getSessionEnablePayload: vi.fn(async () => undefined),
  fetch: vi.fn(),
}))

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => integration.navigate,
}))

vi.mock('@xstate/react', () => ({
  useSelector: (
    _actor: unknown,
    selector: (state: {
      context: { duration: number; selectedToken: 'USDC' }
    }) => unknown,
  ) =>
    selector({
      context: { duration: 31_536_000, selectedToken: 'USDC' },
    }),
}))

vi.mock('@/lib/smart-account/SmartAccountContext', () => ({
  useSmartAccountContext: () => ({
    stablecoinBalances: [
      {
        address: HCA_PAYMENT_TOKEN,
        symbol: 'USDC',
        decimals: 6,
        balance: integration.walletBalanceRaw.toString(),
        formattedBalance: (Number(integration.walletBalanceRaw) / 1e6).toFixed(
          2,
        ),
      },
    ],
    isLoadingBalances: false,
    isConnected: true,
    ownerAddress: null,
    accountAddress: '0x0000000000000000000000000000000000000001',
    signer: null,
    getSessionEnablePayload: integration.getSessionEnablePayload,
  }),
}))

vi.mock('../../../state/registrationUi.context', () => ({
  useRegistrationV2Context: () => ({
    label: 'jeff',
    uiActor: { send: integration.send },
  }),
}))

vi.mock('../../../data/queries/pricing.query', () => ({
  getRegisterPriceQueryOptions: () => ({
    queryKey: ['test-price', integration.testId],
    queryFn: async () => ({
      basePrice: integration.pricingRaw,
      premium: 0n,
    }),
  }),
}))

vi.mock('../../../data/queries/hcaBudget.query', () => ({
  getHcaBudgetQueryOptions: () => ({
    queryKey: ['test-budget', integration.testId],
    queryFn: async () => integration.budget,
    enabled: integration.isBudgetEnabled,
    staleTime: 0,
  }),
}))

vi.mock('../../../data/queries/availability.query', () => ({
  getRegistrationV2AvailabilityQueryOptions: () => ({
    queryKey: ['test-availability', integration.testId],
    queryFn: async () => ({ isAvailable: true }),
  }),
}))

vi.mock('@/features/profile/service/profileReverseName', () => ({
  profileReverseNameQuery: () => ({
    queryKey: ['test-primary-name', integration.testId],
    queryFn: async () => null,
    enabled: false,
  }),
}))

vi.mock('@/features/shared/service/ownedNamesCount', () => ({
  ownedNamesCountQueryOptions: () => ({
    queryKey: ['test-owned-names', integration.testId],
    queryFn: async () => 0,
    enabled: false,
  }),
}))

i18n.loadAndActivate({ locale: 'en', messages: {} })

const usdc = {
  address: '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238',
  symbol: 'USDC',
  decimals: 6,
  balance: '1000000000',
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

beforeEach(() => {
  integration.testId += 1
  integration.isBudgetEnabled = true
  integration.pricingRaw = 8_000_000n
  integration.walletBalanceRaw = 5_000_000n
  integration.budget = {
    registrationPrice: 8_000_000n,
    total: 20_196_054n,
    hcaBalance: 0n,
  }
  integration.send.mockClear()
  integration.navigate.mockClear()
  integration.getSessionEnablePayload.mockClear()
  integration.fetch.mockReset()
  integration.fetch.mockResolvedValue(new Response('{}', { status: 200 }))
  vi.stubGlobal('fetch', integration.fetch)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

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

const renderIntegratedPicker = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider i18n={i18n}>
        <TokenPickerContent />
      </I18nProvider>
    </QueryClientProvider>,
  )
}

describe('TokenPickerContent funding shortfall paths', () => {
  it.each([
    {
      caseName: 'below the name price',
      walletBalanceRaw: 5_000_000n,
      expected: 'Need $20.20 USDC',
    },
    {
      caseName: 'above the name price but below the total',
      walletBalanceRaw: 20_000_000n,
      expected: 'Need $20.20 USDC incl. network fees',
    },
  ])('keeps a render-time shortfall method-local when $caseName', async ({
    walletBalanceRaw,
    expected,
  }) => {
    integration.walletBalanceRaw = walletBalanceRaw

    renderIntegratedPicker()

    const error = await screen.findByText(/^Need /)
    expect(error).toHaveTextContent(expected)
    expect(error.closest('[data-slot="payment-method-error"]')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Register name' })).toBeDisabled()
    expect(integration.fetch).not.toHaveBeenCalled()
  })

  it('classifies a credited render-time shortfall as fees only', async () => {
    integration.budget.hcaBalance = 15_000_000n

    renderIntegratedPicker()

    const error = await screen.findByText(/^Need /)
    expect(error).toHaveTextContent('Need $5.20 USDC incl. network fees')
    expect(error.closest('[data-slot="payment-method-error"]')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Register name' })).toBeDisabled()
    expect(integration.fetch).not.toHaveBeenCalled()
  })

  it('keeps an exact credited name-price boundary in the fee shortfall', async () => {
    integration.walletBalanceRaw = 100_000n
    integration.budget = {
      registrationPrice: 800_000n,
      total: 1_000_000n,
      hcaBalance: 700_000n,
    }

    renderIntegratedPicker()

    const error = await screen.findByText(/^Need /)
    expect(error).toHaveTextContent('Need $0.30 USDC incl. network fees')
    expect(error.closest('[data-slot="payment-method-error"]')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Register name' })).toBeDisabled()
    expect(integration.fetch).not.toHaveBeenCalled()
  })

  it.each([
    {
      caseName: 'below the refreshed name price',
      walletBalanceRaw: 5_000_000n,
      pricingRaw: 4_000_000n,
      expected: 'Need $20.20 USDC',
    },
    {
      caseName: 'above the name price but below the refreshed total',
      walletBalanceRaw: 20_000_000n,
      pricingRaw: 8_000_000n,
      expected: 'Need $20.20 USDC incl. network fees',
    },
  ])('keeps a click-time shortfall method-local when $caseName', async ({
    walletBalanceRaw,
    pricingRaw,
    expected,
  }) => {
    integration.isBudgetEnabled = false
    integration.walletBalanceRaw = walletBalanceRaw
    integration.pricingRaw = pricingRaw

    renderIntegratedPicker()

    const register = await screen.findByRole('button', {
      name: 'Register name',
    })
    await waitFor(() => expect(register).toBeEnabled())
    fireEvent.click(register)

    const error = await screen.findByText(/^Need /)
    expect(error).toHaveTextContent(expected)
    expect(error.closest('[data-slot="payment-method-error"]')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Register name' })).toBeDisabled()
    expect(integration.send).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'registration.start' }),
    )
    expect(integration.fetch).not.toHaveBeenCalled()
  })

  it('classifies a credited click-time shortfall as fees only', async () => {
    integration.isBudgetEnabled = false
    integration.pricingRaw = 4_000_000n
    integration.budget.hcaBalance = 15_000_000n

    renderIntegratedPicker()

    const register = await screen.findByRole('button', {
      name: 'Register name',
    })
    await waitFor(() => expect(register).toBeEnabled())
    fireEvent.click(register)

    const error = await screen.findByText(/^Need /)
    expect(error).toHaveTextContent('Need $5.20 USDC incl. network fees')
    expect(error.closest('[data-slot="payment-method-error"]')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Register name' })).toBeDisabled()
    expect(integration.send).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'registration.start' }),
    )
    expect(integration.fetch).not.toHaveBeenCalled()
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

  it('preserves the rent-only fallback when the fee quote is unavailable', () => {
    renderPicker({ selectedToken: 'USDC' })

    expect(screen.getByText('Mainnet est. fee: —')).toBeVisible()
    expect(screen.getByText('$330.00')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Register name' })).toBeEnabled()
  })

  it('keeps a funding shortfall local to the affected method', () => {
    renderPicker({
      funding: {
        registration: 1_999.8,
        networkFee: 0.2,
        total: 2_000,
        walletDebit: 2_000,
        hcaCredit: 0,
        isLoading: false,
      },
      methodErrorMessage: 'Need $2,000.00 USDC incl. network fees',
      selectedToken: 'USDC',
    })

    const error = screen.getByText('Need $2,000.00 USDC incl. network fees')
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
    expect(screen.getByText('Mainnet est. fee: $1.00')).toBeVisible()
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
