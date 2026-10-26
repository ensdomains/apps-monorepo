import '@testing-library/jest-dom'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { arbitrumSepolia, baseSepolia, optimismSepolia } from 'viem/chains'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { L2Source } from '@/l2Sources'
import type { StablecoinBalance } from '@/lib/smart-account'
import {
  acquireRegistrationLock,
  getBlockingRegistration,
  releaseRegistrationLock,
} from '../../../service/registrationLock'
import type { L2PaymentRow } from '../hooks/useL2Payment'
import { type L2PaymentOption, l2PaymentOptionId } from '../lib/paymentOptions'
import {
  TokenPickerContent,
  TokenPickerContentBase,
} from './TokenPickerContent'

const containerMocks = vi.hoisted(() => ({
  isBudgetPending: false,
  renderBudget: null as {
    total: bigint
    registrationPrice: bigint
    hcaBalance: bigint
    commitCost?: bigint
  } | null,
  revalidatedBudget: null as {
    total: bigint
    registrationPrice: bigint
    hcaBalance: bigint
  } | null,
  walletBalance: '100000000',
  availabilityError: null as Error | null,
  fetchCalls: 0,
  send: vi.fn(),
  getSessionEnablePayload: vi.fn<() => Promise<undefined>>(),
  getSnapshot: vi.fn<() => object>(),
  isApproving: false,
  approvalOutcome: 'none' as 'none' | 'failed' | 'rejected',
  lastErrorMessage: undefined as string | undefined,
  l2Balances: undefined as Record<number, bigint | null> | undefined,
  ownerAddress: null as string | null,
  fundingSourceChainId: undefined as number | undefined,
  /** What every quoted L2 row is charged. */
  l2AmountIn: undefined as bigint | undefined,
  l2QuoteKeys: [] as string[],
}))

vi.mock('@xstate/react', () => ({
  useSelector: (actor: unknown, select: (state: unknown) => unknown) =>
    actor
      ? select({
          matches: () => containerMocks.isApproving,
          context: {
            duration: 31_536_000,
            selectedToken: 'USDC',
            fundingSourceChainId: containerMocks.fundingSourceChainId,
            approvalOutcome: containerMocks.approvalOutcome,
            lastErrorMessage: containerMocks.lastErrorMessage,
            confirmedData: containerMocks.isApproving
              ? { ownerAddress: '0x1111111111111111111111111111111111111111' }
              : undefined,
          },
        })
      : select(undefined),
}))

vi.mock('../../../state/registrationUi.context', () => ({
  useRegistrationV2Context: () => ({
    label: 'jeff',
    uiActor: {
      send: containerMocks.send,
      getSnapshot: containerMocks.getSnapshot,
    },
  }),
}))

vi.mock('@/lib/smart-account/useSmartAccountBalances', () => ({
  HCA_PAYMENT_TOKEN: '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238',
}))

vi.mock('@/lib/smart-account/SmartAccountContext', () => ({
  useSmartAccountContext: () => ({
    accountAddress: '0x0000000000000000000000000000000000000001',
    ownerAddress: containerMocks.ownerAddress,
    signer: { type: 'rhinestone', account: { config: {} } },
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
    getSessionEnablePayload: containerMocks.getSessionEnablePayload,
  }),
}))

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => vi.fn(),
  useSearch: () => ({ referrer: '0x1234' }),
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
          data: containerMocks.renderBudget
            ? { commitCost: 0n, ...containerMocks.renderBudget }
            : undefined,
          isError: false,
          isLoading: false,
          isFetching: false,
          isPending: containerMocks.isBudgetPending,
          isPlaceholderData: false,
        }
      }
      if (key.includes('l2-usdc-balances')) {
        return { data: containerMocks.l2Balances, isLoading: false }
      }
      return { data: undefined, isLoading: false }
    },
    useQueries: ({
      queries,
    }: {
      queries: { queryKey?: unknown; enabled?: boolean }[]
    }) =>
      queries.map(({ queryKey, enabled }) => {
        if (enabled) containerMocks.l2QuoteKeys.push(JSON.stringify(queryKey))
        const { l2AmountIn } = containerMocks
        return {
          data:
            enabled && l2AmountIn !== undefined
              ? { amountIn: l2AmountIn }
              : undefined,
          isLoading: false,
          isError: false,
        }
      }),
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
    useMutation: (options: {
      mutationFn: () => Promise<unknown>
      onSuccess?: (data: unknown) => unknown
    }) => {
      const [error, setError] = React.useState<Error | null>(null)
      return {
        error,
        isError: error !== null,
        mutate: () =>
          void options
            .mutationFn()
            .then((data) => options.onSuccess?.(data))
            .catch(setError),
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

/** One receipt line, label and amount together. */
const receiptRow = (label: string) => {
  const row = screen.getByText(label).closest('div')
  if (!row) throw new Error(`No receipt row for ${label}`)
  return row
}

describe('TokenPickerContent', () => {
  beforeEach(() => {
    containerMocks.renderBudget = null
    containerMocks.isBudgetPending = false
    containerMocks.revalidatedBudget = null
    containerMocks.walletBalance = '100000000'
    containerMocks.availabilityError = null
    containerMocks.fetchCalls = 0
    containerMocks.isApproving = false
    containerMocks.approvalOutcome = 'none'
    containerMocks.lastErrorMessage = undefined
    containerMocks.send.mockClear()
    containerMocks.getSnapshot.mockReset().mockReturnValue({})
    containerMocks.getSessionEnablePayload
      .mockReset()
      .mockResolvedValue(undefined)
    containerMocks.l2Balances = undefined
    containerMocks.ownerAddress = null
    containerMocks.fundingSourceChainId = undefined
    containerMocks.l2AmountIn = undefined
    containerMocks.l2QuoteKeys = []
  })

  it('keeps the wallet locked while payment approval takes longer than a minute', () => {
    const owner = '0x1111111111111111111111111111111111111111'
    vi.useFakeTimers()
    containerMocks.isApproving = true
    acquireRegistrationLock(owner, 'jeff.eth')
    const view = renderContainer()

    try {
      expect(
        screen.getByRole('button', { name: 'Preparing registration…' }),
      ).toBeDisabled()
      expect(
        screen.getByRole('switch', {
          name: 'Set jeff.eth as your primary name',
        }),
      ).toBeDisabled()
      vi.advanceTimersByTime(75_000)
      expect(getBlockingRegistration(owner, 'other.eth')).toBe('jeff.eth')
    } finally {
      view.unmount()
      releaseRegistrationLock(owner)
      vi.useRealTimers()
    }
  })

  it('starts registration after checking availability and preparing the session', async () => {
    renderContainer()
    fireEvent.click(
      screen.getByRole('button', { name: 'Approve and register' }),
    )

    await waitFor(() =>
      expect(containerMocks.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'registration.start',
          label: 'jeff',
          referrer: '0x1234',
        }),
      ),
    )
  })

  it('ignores a click when the pricing snapshot changes while preparation is pending', async () => {
    let finishPreparation: () => void = () => {
      throw new Error('Session preparation has not started')
    }
    containerMocks.getSessionEnablePayload.mockReturnValue(
      new Promise((resolve) => {
        finishPreparation = () => resolve(undefined)
      }),
    )
    renderContainer()
    fireEvent.click(
      screen.getByRole('button', { name: 'Approve and register' }),
    )

    await waitFor(() =>
      expect(containerMocks.getSessionEnablePayload).toHaveBeenCalledOnce(),
    )
    containerMocks.getSnapshot.mockReturnValue({})
    finishPreparation()

    await waitFor(() =>
      expect(containerMocks.getSnapshot).toHaveBeenCalledTimes(2),
    )
    expect(containerMocks.send).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'registration.start' }),
    )
  })

  const fiveUsdcBudget = {
    total: 5_000_000n,
    registrationPrice: 4_800_000n,
    hcaBalance: 0n,
  }

  it('lists the wallet first, then L2s by balance, three at a time', () => {
    containerMocks.renderBudget = fiveUsdcBudget
    containerMocks.l2Balances = {
      [baseSepolia.id]: 6_000_000n,
      [arbitrumSepolia.id]: 25_000_000n,
      [optimismSepolia.id]: null,
    }
    renderContainer()

    const methodNames = () =>
      screen
        .getAllByRole('button', { name: /^Select USDC/ })
        .map((button) => button.getAttribute('aria-label'))
    expect(methodNames()).toEqual([
      'Select USDC',
      'Select USDC on Arbitrum Sepolia',
      'Select USDC on Base Sepolia',
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Show 1 more' }))
    expect(methodNames().at(-1)).toBe('Select USDC on OP Sepolia')
  })

  it('hides an L2 known to be short, but keeps the wallet', () => {
    containerMocks.walletBalance = '0'
    containerMocks.renderBudget = fiveUsdcBudget
    containerMocks.l2Balances = {
      [baseSepolia.id]: 25_000_000n,
      [arbitrumSepolia.id]: 1_000_000n,
    }
    renderContainer()

    expect(screen.getByRole('button', { name: 'Select USDC' })).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Select USDC on Arbitrum Sepolia' }),
    ).not.toBeInTheDocument()
  })

  it('holds the receipt while the quote waits on a paused retry', () => {
    containerMocks.ownerAddress = '0x2222222222222222222222222222222222222222'
    containerMocks.walletBalance = '0'
    containerMocks.isBudgetPending = true
    renderContainer()

    expect(
      screen.getByRole('button', { name: 'Calculating total…' }),
    ).toBeDisabled()
    expect(screen.queryByText(/more needed/)).not.toBeInTheDocument()
  })

  it('needs no method when the account credit covers it all, bridging nothing', () => {
    containerMocks.ownerAddress = '0x2222222222222222222222222222222222222222'
    containerMocks.renderBudget = { ...fiveUsdcBudget, hcaBalance: 5_000_000n }
    containerMocks.l2Balances = { [baseSepolia.id]: 25_000_000n }
    renderContainer()

    expect(
      screen.queryByRole('button', { name: 'Select USDC on Base Sepolia' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Register name' })).toBeEnabled()
    expect(containerMocks.l2QuoteKeys).toHaveLength(0)
  })

  it('quotes each L2 that can pay for what the permit would carry', () => {
    containerMocks.ownerAddress = '0x2222222222222222222222222222222222222222'
    containerMocks.renderBudget = { ...fiveUsdcBudget, commitCost: 100_000n }
    containerMocks.l2Balances = {
      [baseSepolia.id]: 25_000_000n,
      [arbitrumSepolia.id]: 0n,
    }
    containerMocks.l2AmountIn = 5_012_000n
    renderContainer()

    // Only Base Sepolia holds enough to be quoted, for the whole shortfall:
    // the legs pay their fees from the account, as after a permit.
    const quoted = [...new Set(containerMocks.l2QuoteKeys)]
    expect(quoted).toHaveLength(1)
    expect(quoted[0]).toContain(`${baseSepolia.id}`)
    expect(quoted[0]).toContain('"5000000"')
    // $5.012 charged there for a $4.80 name.
    expect(screen.getByText('Base Sepolia · est. fee $0.21')).toBeVisible()
  })

  it('registers from the chosen L2 whatever the wallet holds', async () => {
    containerMocks.walletBalance = '0'
    containerMocks.ownerAddress = '0x2222222222222222222222222222222222222222'
    containerMocks.renderBudget = fiveUsdcBudget
    containerMocks.revalidatedBudget = fiveUsdcBudget
    containerMocks.l2Balances = { [baseSepolia.id]: 25_000_000n }
    containerMocks.l2AmountIn = 5_012_000n
    containerMocks.fundingSourceChainId = baseSepolia.id
    renderContainer()

    fireEvent.click(
      screen.getByRole('button', { name: 'Sign payment approval' }),
    )

    await waitFor(() =>
      expect(containerMocks.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'registration.start',
          l2FundingChainId: baseSepolia.id,
        }),
      ),
    )
  })

  // An L2 payment can fail for a reason the user acts on, like one still settling.
  it('shows why a payment from the L2 failed rather than a generic approval error', () => {
    containerMocks.renderBudget = fiveUsdcBudget
    containerMocks.l2Balances = { [baseSepolia.id]: 25_000_000n }
    containerMocks.l2AmountIn = 5_012_000n
    containerMocks.fundingSourceChainId = baseSepolia.id
    containerMocks.approvalOutcome = 'failed'
    containerMocks.lastErrorMessage =
      'The earlier L2 payment has not settled yet, so not paying again.'
    renderContainer()

    expect(screen.getByRole('alert')).toHaveTextContent(
      'The earlier L2 payment has not settled yet, so not paying again.',
    )
  })

  it('keeps the generic approval error for a payment from the wallet', () => {
    containerMocks.approvalOutcome = 'failed'
    containerMocks.lastErrorMessage = 'User denied transaction signature.'
    renderContainer()

    expect(screen.getByRole('alert')).toHaveTextContent(
      "We couldn't approve your payment.",
    )
  })

  // Wallet holds $100; the click-time quote asks for $999.
  const captureRevalidatedShortfall = async () => {
    containerMocks.revalidatedBudget = {
      total: 999_000_000n,
      registrationPrice: 999_000_000n,
      hcaBalance: 0n,
    }
    const view = renderContainer()
    fireEvent.click(
      screen.getByRole('button', { name: 'Approve and register' }),
    )
    await screen.findByText('$899.00 more needed in your wallet.')
    return view
  }

  it('prefers the rendered shortfall to a click-time one', async () => {
    const view = await captureRevalidatedShortfall()
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
      screen.getByText('$100.00 more needed in your wallet.'),
    ).toBeVisible()
    expect(
      screen.queryByText('$899.00 more needed in your wallet.'),
    ).not.toBeInTheDocument()
  })

  it('keeps a non-funding mutation failure global only', async () => {
    containerMocks.availabilityError = new Error('availability failed')
    renderContainer()
    fireEvent.click(
      screen.getByRole('button', { name: 'Approve and register' }),
    )

    const error = await screen.findByText(
      "We couldn't confirm that jeff.eth is still available. Please try again.",
    )
    expect(error).toBeVisible()
    expect(error.closest('[data-slot="payment-method-error"]')).toBeNull()
    await waitFor(() =>
      expect(
        screen.queryByText(/more needed in your wallet/),
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

  it('lets a wallet through that only covers what the account does not', () => {
    // A renewal: 1,000 USDC in the wallet against a 1,200 price, with 300 USDC
    // already in the smart account, which pays first.
    renderPicker({
      accountCredit: { USDC: 300 },
      nextMessage: 'Renew Name',
      pricingData: 1_200,
      selectedToken: 'USDC',
      showNetworkFeeDetails: false,
    })

    expect(screen.getByRole('button', { name: 'Renew Name' })).toBeEnabled()
  })

  it('checks each coin against the account credit in that coin only', () => {
    renderPicker({
      accountCredit: { DAI: 300 },
      nextMessage: 'Renew Name',
      pricingData: 1_200,
      selectedToken: 'USDC',
      showNetworkFeeDetails: false,
    })

    expect(screen.getByRole('button', { name: 'Renew Name' })).toBeDisabled()
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

  it('shows the total, the balance applied and what the wallet pays', () => {
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

    expect(receiptRow('Registration total')).toHaveTextContent('up to $164.32')
    expect(receiptRow('Available balance applied')).toHaveTextContent('−$1.82')
    expect(receiptRow('Due from your wallet')).toHaveTextContent(
      'up to $162.50',
    )
  })

  it('shows a known zero balance as $0.00', () => {
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

    expect(receiptRow('Available balance applied')).toHaveTextContent('$0.00')
    expect(receiptRow('Due from your wallet')).toHaveTextContent('$164.32')
  })

  it('replaces the methods with a note when the balance covers everything', () => {
    renderPicker({
      funding: {
        registration: 160,
        networkFee: 4.32,
        total: 164.32,
        walletDebit: 0,
        hcaCredit: 164.32,
        isLoading: false,
      },
      selectedToken: 'USDC',
    })

    expect(screen.getByText(/No additional payment needed/)).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Select USDC' }),
    ).not.toBeInTheDocument()
    expect(receiptRow('Due from your wallet')).toHaveTextContent('$0.00')
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
    expect(screen.getByText('Sepolia · est. fee $4.32')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'What does the total include?' }),
    ).toBeVisible()
    expect(screen.queryByText('Network fee')).not.toBeInTheDocument()
  })

  it('keeps fee quote loading on the affected method', () => {
    renderPicker({
      isQuotingFunding: true,
      selectedToken: 'USDC',
    })

    const fee = screen.getByText('Sepolia · est. fee —')
    expect(fee).toBeVisible()
    expect(fee).toHaveClass('animate-pulse')
    expect(screen.queryByText('Network fee')).not.toBeInTheDocument()
  })

  it('keeps the methods when a sub-cent debit is still owed', () => {
    renderPicker({
      funding: {
        registration: 4.8,
        networkFee: 0.2,
        total: 5,
        walletDebit: 0.001,
        hcaCredit: 4.999,
        isLoading: false,
      },
      selectedToken: 'USDC',
      stablecoinBalances: [emptyUsdc],
    })

    expect(screen.getByRole('button', { name: 'Select USDC' })).toBeVisible()
    expect(
      screen.queryByText(/No additional payment needed/),
    ).not.toBeInTheDocument()
  })

  it('keeps the covered note through a background refetch', () => {
    renderPicker({
      funding: {
        registration: 160,
        networkFee: 4.32,
        total: 164.32,
        walletDebit: 0,
        hcaCredit: 164.32,
        isLoading: true,
      },
      isQuotingFunding: true,
      selectedToken: 'USDC',
    })

    expect(screen.getByText(/No additional payment needed/)).toBeVisible()
    expect(receiptRow('Due from your wallet')).toHaveTextContent('$0.00')
  })

  it('totals the funded amount when no fee quote is available', () => {
    renderPicker({
      fundedAmount: 5.5,
      pricingData: 5,
      selectedToken: 'USDC',
      showNetworkFeeDetails: false,
    })

    expect(receiptRow('Due from your wallet')).toHaveTextContent('up to $5.50')
  })

  it('holds the receipt and the button while the fee is being quoted', () => {
    renderPicker({ isQuotingFunding: true, selectedToken: 'USDC' })

    expect(
      screen.getByRole('region', { name: 'Payment summary' }),
    ).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByText('$330.00')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Register name' })).toBeDisabled()
  })

  it('leaves the EOA route alone when there is no budget to quote', () => {
    renderPicker({ selectedToken: 'USDC' })

    expect(screen.getByText('Sepolia · est. fee —')).toBeVisible()
    expect(receiptRow('Due from your wallet')).toHaveTextContent(
      /^.*\$330\.00$/,
    )
    expect(screen.getByRole('button', { name: 'Register name' })).toBeEnabled()
    expect(screen.queryByText('up to')).not.toBeInTheDocument()
  })

  it('offers only a retry, with no figures, when the required quote failed', () => {
    const onRetry = vi.fn()
    renderPicker({ hasBudgetQuoteFailed: true, onRetry, selectedToken: 'USDC' })

    expect(receiptRow('Registration total')).toHaveTextContent('—')
    expect(receiptRow('Due from your wallet')).toHaveTextContent('—')
    expect(
      screen.queryByRole('button', { name: 'Register name' }),
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledOnce()
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

    const button = screen.getByRole('button', { name: 'Register name' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(
      screen.getByRole('region', { name: 'Payment summary' }),
    ).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByText('Sepolia · est. fee $4.32')).toBeVisible()
  })

  it('shows the wallet shortfall under the receipt', () => {
    renderPicker({
      selectedToken: 'USDC',
      stablecoinBalances: [emptyUsdc],
    })

    expect(
      screen.getByText('$330.00 more needed in your wallet.'),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Register name' })).toBeDisabled()
  })

  it('shows an error in place of the shortfall', () => {
    renderPicker({
      globalErrorMessage: 'Signature cancelled. You can try again.',
      revalidatedShortfall: 5,
      selectedToken: 'USDC',
      stablecoinBalances: [emptyUsdc],
    })

    expect(
      screen.getByText('Signature cancelled. You can try again.'),
    ).toBeVisible()
    expect(screen.queryByText(/more needed/)).not.toBeInTheDocument()
  })
})

describe('TokenPickerContentBase L2 rows', () => {
  const underfunded = {
    registration: 4.8,
    networkFee: 0.2,
    total: 5,
    walletDebit: 5,
    hcaCredit: 0,
    isLoading: false,
  }
  const baseSepoliaRow = (
    status: L2PaymentOption['status'],
    overrides: Partial<L2PaymentRow> = {},
  ): L2PaymentRow => ({
    option: {
      id: l2PaymentOptionId(baseSepolia.id),
      source: {
        chain: baseSepolia,
        usdc: emptyUsdc.address,
        rpcUrls: [],
        client: {} as L2Source['client'],
      },
      balanceRaw: 25_000_000n,
      status,
    },
    amountInRaw: undefined,
    isQuoteLoading: false,
    hasQuoteFailed: false,
    ...overrides,
  })
  const l2Payment = (
    row: L2PaymentRow,
    selectedChainId: number | undefined = undefined,
  ) => ({ rows: [row], selectedChainId, onSelect: vi.fn() })

  it('lists an L2 next to a wallet that cannot pay, and selects it on click', () => {
    const payment = l2Payment(baseSepoliaRow('available'))
    renderPicker({
      funding: underfunded,
      selectedToken: 'USDC',
      stablecoinBalances: [emptyUsdc],
      l2Payment: payment,
    })

    fireEvent.click(
      screen.getByRole('button', { name: 'Select USDC on Base Sepolia' }),
    )
    expect(payment.onSelect).toHaveBeenCalledWith(baseSepolia.id)
    expect(screen.getByRole('button', { name: 'Register name' })).toBeDisabled()
  })

  it('registers from a chosen L2 once quoted, and totals what it is charged', () => {
    renderPicker({
      funding: underfunded,
      selectedToken: 'USDC',
      stablecoinBalances: [emptyUsdc],
      l2Payment: l2Payment(
        baseSepoliaRow('available', { amountInRaw: 5_012_573n }),
        baseSepolia.id,
      ),
    })

    expect(screen.getByText('Base Sepolia · est. fee $0.21')).toBeVisible()
    expect(receiptRow('Due from your wallet')).toHaveTextContent('$5.01')
    expect(screen.getByRole('button', { name: 'Register name' })).toBeEnabled()
  })

  it('holds the registration until the chosen L2 is quoted', () => {
    renderPicker({
      funding: underfunded,
      selectedToken: 'USDC',
      stablecoinBalances: [usdc],
      l2Payment: l2Payment(baseSepoliaRow('available'), baseSepolia.id),
    })

    expect(screen.getByRole('button', { name: 'Register name' })).toBeDisabled()
  })

  it('refuses a chosen L2 whose balance falls short of its quote', () => {
    const row = baseSepoliaRow('available', { amountInRaw: 5_012_573n })
    renderPicker({
      funding: underfunded,
      selectedToken: 'USDC',
      stablecoinBalances: [usdc],
      l2Payment: l2Payment(
        { ...row, option: { ...row.option, balanceRaw: 5_000_001n } },
        baseSepolia.id,
      ),
    })

    expect(screen.getByText('$0.01 more needed on Base Sepolia.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Register name' })).toBeDisabled()
  })

  it('says so when an L2 that can pay has no route', () => {
    renderPicker({
      funding: underfunded,
      selectedToken: 'USDC',
      stablecoinBalances: [usdc],
      l2Payment: l2Payment(
        baseSepoliaRow('available', { hasQuoteFailed: true }),
        baseSepolia.id,
      ),
    })

    expect(
      screen.getByText("Paying from Base Sepolia isn't available right now."),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Register name' })).toBeDisabled()
  })

  it('estimates an unquoted L2 from a quoted one, fee and top-up both', () => {
    const quoted = baseSepoliaRow('available', { amountInRaw: 5_012_573n })
    const short = baseSepoliaRow('insufficient')
    const op = {
      ...short,
      option: {
        ...short.option,
        id: l2PaymentOptionId(optimismSepolia.id),
        source: { ...short.option.source, chain: optimismSepolia },
        balanceRaw: 3_000_000n,
      },
    }
    renderPicker({
      funding: underfunded,
      selectedToken: 'USDC',
      stablecoinBalances: [usdc],
      l2Payment: {
        rows: [quoted, op],
        selectedChainId: optimismSepolia.id,
        onSelect: vi.fn(),
      },
    })

    expect(screen.getByText('OP Sepolia · est. fee ~$0.21')).toBeVisible()
    expect(
      screen.getByText('About $2.01 more needed on OP Sepolia.'),
    ).toBeVisible()
  })

  it('lets an L2 that cannot pay be chosen, and says what it is short by', () => {
    const row = baseSepoliaRow('insufficient')
    renderPicker({
      funding: underfunded,
      selectedToken: 'USDC',
      stablecoinBalances: [usdc],
      l2Payment: l2Payment(
        { ...row, option: { ...row.option, balanceRaw: 3_000_000n } },
        baseSepolia.id,
      ),
    })

    expect(
      screen.getByText('At least $2.00 more needed on Base Sepolia.'),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Register name' })).toBeDisabled()
  })
})
