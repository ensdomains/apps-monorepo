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
import type { EthPaymentRow } from './EthPaymentListItem'
import {
  TokenPickerContent,
  TokenPickerContentBase,
} from './TokenPickerContent'

const containerMocks = vi.hoisted(() => ({
  isBudgetPending: false,
  isBudgetStale: false,
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
  fundingSourceOrigin: undefined as 'user' | 'fallback' | undefined,
  /** What every quoted L2 row is charged. */
  l2AmountIn: undefined as bigint | undefined,
  l2QuoteKeys: [] as string[],
  paymentAsset: undefined as 'eth' | undefined,
  /** What the ETH row's quote reads, when it has one. */
  ethQuote: null as {
    swap: { maximumEth: bigint }
    walletBalance: bigint
    gasReserve: bigint
    ethUsd: bigint
  } | null,
  enableSession: vi.fn(),
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
            fundingSourceOrigin: containerMocks.fundingSourceOrigin,
            paymentAsset: containerMocks.paymentAsset,
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
    enableSession: containerMocks.enableSession,
  }),
}))

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => vi.fn(),
  useSearch: () => ({ referrer: '0x1234' }),
}))

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const React = await import('react')
  const ethQuoteResult = () => ({
    data: containerMocks.ethQuote ?? undefined,
    isPending: false,
    isPlaceholderData: false,
    isError: false,
  })
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
          isPlaceholderData: containerMocks.isBudgetStale,
        }
      }
      if (key.includes('eth-payment-quote')) return ethQuoteResult()
      if (key.includes('l2-usdc-balances')) {
        const balances = containerMocks.l2Balances
        return {
          data:
            balances &&
            Object.fromEntries(
              Object.entries(balances).map(([chainId, usdc]) => [
                chainId,
                usdc === null ? null : { usdc },
              ]),
            ),
          isLoading: false,
        }
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
        const { l2AmountIn, isBudgetStale } = containerMocks
        // A re-quote keeps the previous quote as placeholder data.
        const hasData = (enabled || isBudgetStale) && l2AmountIn !== undefined
        return {
          data: hasData ? { amountIn: l2AmountIn } : undefined,
          isPlaceholderData: hasData && !enabled,
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
    containerMocks.isBudgetStale = false
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
    containerMocks.fundingSourceOrigin = undefined
    containerMocks.l2AmountIn = undefined
    containerMocks.l2QuoteKeys = []
    containerMocks.paymentAsset = undefined
    containerMocks.ethQuote = null
    containerMocks.enableSession.mockReset()
  })

  it('keeps the wallet locked while payment approval takes longer than a minute', () => {
    const owner = '0x1111111111111111111111111111111111111111'
    vi.useFakeTimers()
    containerMocks.isApproving = true
    acquireRegistrationLock(owner, 'jeff.eth')
    const view = renderContainer()

    try {
      expect(
        screen.getByRole('button', { name: 'Registering...' }),
      ).toBeDisabled()
      vi.advanceTimersByTime(75_000)
      expect(getBlockingRegistration(owner, 'other.eth')).toBe('jeff.eth')
    } finally {
      view.unmount()
      releaseRegistrationLock(owner)
      vi.useRealTimers()
    }
  })

  it('keeps explaining the signature while registering', () => {
    containerMocks.isApproving = true
    renderContainer()

    expect(
      screen.getByRole('button', { name: 'Registering...' }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'What will I sign?' }),
    ).toBeVisible()
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

  it('starts an ETH payment on the session of the USDC the swap buys', async () => {
    const ethSession = {
      signer: { type: 'rhinestone', session: 'circle' },
      hcaSessionEnable: { stub: 'circle' },
    }
    containerMocks.paymentAsset = 'eth'
    containerMocks.ethQuote = {
      swap: { maximumEth: 10n ** 16n },
      walletBalance: 10n ** 18n,
      gasReserve: 0n,
      ethUsd: 2_000_00000000n,
    }
    containerMocks.enableSession.mockResolvedValue({
      status: 'enabled',
      session: ethSession,
    })
    renderContainer()
    fireEvent.click(screen.getByRole('button', { name: 'Swap and Register' }))

    await waitFor(() =>
      expect(containerMocks.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'registration.start',
          account: expect.objectContaining({ signer: ethSession.signer }),
          hcaSessionEnable: ethSession.hcaSessionEnable,
        }),
      ),
    )
    // Sepolia's MockUSDC has no pool, so ETH buys and pays in Circle's USDC.
    expect(containerMocks.enableSession).toHaveBeenCalledWith({
      refundToken: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    })
    expect(containerMocks.getSessionEnablePayload).not.toHaveBeenCalled()
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

  it('lists the wallet first, then quoted L2s by balance, three at a time', () => {
    containerMocks.ownerAddress = '0x2222222222222222222222222222222222222222'
    containerMocks.renderBudget = fiveUsdcBudget
    containerMocks.l2Balances = {
      [baseSepolia.id]: 6_000_000n,
      [arbitrumSepolia.id]: 25_000_000n,
      [optimismSepolia.id]: 10_000_000n,
    }
    containerMocks.l2AmountIn = 5_012_000n
    renderContainer()

    const methodNames = () =>
      screen
        .getAllByRole('button', { name: /^Select USDC/ })
        .map((button) => button.getAttribute('aria-label'))
    expect(methodNames()).toEqual([
      'Select USDC',
      'Select USDC on Arbitrum Sepolia',
      'Select USDC on OP Sepolia',
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(methodNames().at(-1)).toBe('Select USDC on Base Sepolia')
  })
  it('keeps a funded L2 listed while the primary-name toggle re-quotes', () => {
    containerMocks.ownerAddress = '0x2222222222222222222222222222222222222222'
    containerMocks.renderBudget = fiveUsdcBudget
    containerMocks.isBudgetStale = true
    containerMocks.l2Balances = { [baseSepolia.id]: 25_000_000n }
    containerMocks.l2AmountIn = 5_012_000n
    renderContainer()

    expect(
      screen.getByRole('button', { name: 'Select USDC on Base Sepolia' }),
    ).toBeVisible()
    expect(containerMocks.l2QuoteKeys).toHaveLength(0)
  })

  it('keeps loading, not claiming no funds, while L2 balances load', () => {
    containerMocks.walletBalance = '0'
    containerMocks.renderBudget = fiveUsdcBudget
    containerMocks.l2Balances = undefined
    renderContainer()

    expect(screen.getByText('Loading balances…')).toBeVisible()
    expect(
      screen.queryByText(/do not have enough USDC/),
    ).not.toBeInTheDocument()
  })

  it('shows the wallet and an L2 holding USDC before the L2 is quoted', () => {
    containerMocks.l2Balances = { [baseSepolia.id]: 25_000_000n }
    renderContainer()

    expect(screen.getByRole('button', { name: 'Select USDC' })).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Select USDC on Base Sepolia' }),
    ).toBeVisible()
  })
  it.each([
    ['nothing', '0'],
    ['under a cent', '4169'],
  ])(
    'lists every method holding something, short or not, and hides a wallet holding %s',
    (_case, walletBalance) => {
      containerMocks.ownerAddress = '0x2222222222222222222222222222222222222222'
      containerMocks.walletBalance = walletBalance
      containerMocks.renderBudget = fiveUsdcBudget
      containerMocks.l2Balances = {
        [baseSepolia.id]: 25_000_000n,
        [arbitrumSepolia.id]: 1_000_000n,
      }
      containerMocks.l2AmountIn = 5_012_000n
      renderContainer()

      expect(
        screen.getByRole('button', { name: 'Select USDC on Base Sepolia' }),
      ).toBeVisible()
      expect(
        screen.queryByRole('button', { name: 'Select USDC' }),
      ).not.toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Select USDC on Arbitrum Sepolia' }),
      ).toBeVisible()
    },
  )

  it('moves to the L2 holding the most when the wallet cannot pay', () => {
    containerMocks.ownerAddress = '0x2222222222222222222222222222222222222222'
    containerMocks.walletBalance = '0'
    containerMocks.renderBudget = fiveUsdcBudget
    containerMocks.l2Balances = {
      [optimismSepolia.id]: 10_000_000n,
      [baseSepolia.id]: 25_000_000n,
    }
    containerMocks.l2AmountIn = 5_012_000n
    renderContainer()

    expect(containerMocks.send).toHaveBeenCalledWith({
      type: 'pricing.fundingSource.select',
      chainId: baseSepolia.id,
      origin: 'fallback',
    })
    expect(
      screen.queryByText(/Not enough USDC in your wallet/),
    ).not.toBeInTheDocument()
  })

  it.each([
    { origin: 'fallback' as const, isMovedToWallet: true },
    { origin: 'user' as const, isMovedToWallet: false },
  ])(
    'with the wallet able to pay again, an L2 picked by the $origin moves back: $isMovedToWallet',
    ({ origin, isMovedToWallet }) => {
      containerMocks.ownerAddress = '0x2222222222222222222222222222222222222222'
      containerMocks.renderBudget = fiveUsdcBudget
      containerMocks.l2Balances = { [baseSepolia.id]: 25_000_000n }
      containerMocks.l2AmountIn = 5_012_000n
      containerMocks.fundingSourceChainId = baseSepolia.id
      containerMocks.fundingSourceOrigin = origin
      renderContainer()

      const isWalletSelected = containerMocks.send.mock.calls.some(
        ([event]) =>
          event.type === 'pricing.token.select' && event.token === 'USDC',
      )
      expect(isWalletSelected).toBe(isMovedToWallet)
    },
  )

  it('keeps the wallet when it can pay, whatever the L2s hold', () => {
    containerMocks.ownerAddress = '0x2222222222222222222222222222222222222222'
    containerMocks.renderBudget = fiveUsdcBudget
    containerMocks.l2Balances = { [baseSepolia.id]: 250_000_000n }
    containerMocks.l2AmountIn = 5_012_000n
    renderContainer()

    expect(containerMocks.send).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'pricing.fundingSource.select' }),
    )
  })

  it('holds the receipt while the quote waits on a paused retry', () => {
    containerMocks.ownerAddress = '0x2222222222222222222222222222222222222222'
    containerMocks.walletBalance = '0'
    containerMocks.isBudgetPending = true
    renderContainer()

    expect(screen.getByRole('button', { name: 'Loading...' })).toBeDisabled()
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
    expect(screen.getByRole('button', { name: 'Sign approval' })).toBeEnabled()
    expect(
      screen.getByRole('button', { name: 'What will I sign?' }),
    ).toBeVisible()
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
    expect(screen.getByText('Est. fee: $0.21')).toBeVisible()
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

    fireEvent.click(screen.getByRole('button', { name: 'Sign approval' }))

    await waitFor(() =>
      expect(containerMocks.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'registration.start',
          l2FundingChainId: baseSepolia.id,
        }),
      ),
    )
  })

  // Say a retry after the bridge landed: the chosen L2 has nothing to send.
  it('pays from the account, not a chosen L2, once the account covers it all', async () => {
    const covered = { ...fiveUsdcBudget, hcaBalance: 5_000_000n }
    containerMocks.walletBalance = '0'
    containerMocks.ownerAddress = '0x2222222222222222222222222222222222222222'
    containerMocks.renderBudget = covered
    containerMocks.revalidatedBudget = covered
    containerMocks.l2Balances = { [baseSepolia.id]: 25_000_000n }
    containerMocks.fundingSourceChainId = baseSepolia.id
    renderContainer()

    // Covered in full, registration shows the receipt alone.
    expect(screen.getByText(/No additional payment needed/)).not.toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Sign approval' }))

    await waitFor(() =>
      expect(containerMocks.send).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'registration.start' }),
      ),
    )
    expect(containerMocks.send).not.toHaveBeenCalledWith(
      expect.objectContaining({ l2FundingChainId: baseSepolia.id }),
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

  it('shows a shortfall found at click time as the modal warning', async () => {
    await captureRevalidatedShortfall()

    expect(screen.getByRole('alert')).toHaveTextContent(
      '$899.00 more needed in your wallet.',
    )
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
  it('shows a caller heading in place of the name', () => {
    renderPicker({ header: <p>3 names to renew</p> })

    expect(screen.getByText('3 names to renew')).toBeVisible()
    expect(screen.queryByText('jeff.eth')).not.toBeInTheDocument()
  })

  it('selects the only payment option automatically', () => {
    const onSelectCoin = renderPicker()

    expect(onSelectCoin).toHaveBeenCalledWith('USDC', 'fallback')
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
    // The 1,000 USDC balance covers the 330 price but not the 2,000 debit —
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

  it('shows the total, the existing balance and what the user pays', () => {
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

    expect(receiptRow('Registration total')).toHaveTextContent('$164.32')
    expect(receiptRow('Existing balance')).toHaveTextContent('-$1.82')
    expect(receiptRow('You pay')).toHaveTextContent('$162.50')
  })
  it('explains where the existing balance came from', async () => {
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

    fireEvent.focus(
      screen.getByRole('button', { name: 'Where did this come from?' }),
    )

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'left in your ENS account by a payment you started earlier',
    )
  })
  it('shows a single total without an existing balance', () => {
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

    expect(receiptRow('Total')).toHaveTextContent('$164.32')
    expect(screen.queryByText('Existing balance')).not.toBeInTheDocument()
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
    expect(receiptRow('You pay')).toHaveTextContent('$0.00')
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

    expect(screen.getByText('available')).toBeVisible()
    expect(screen.queryByText('in your wallet')).not.toBeInTheDocument()
    expect(screen.getByText('Est. fee: $4.32')).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'What is the network fee?' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Network fee')).not.toBeInTheDocument()
  })

  it.each([
    { walletDebit: 0, isPickerShown: false },
    { walletDebit: 16.45, isPickerShown: true },
  ])(
    'with a balance beyond the name cost, lists the methods only while the wallet pays ($walletDebit)',
    ({ walletDebit, isPickerShown }) => {
      renderPicker({
        funding: {
          registration: 16.52,
          networkFee: 25.46,
          total: 41.98,
          walletDebit,
          hcaCredit: 41.98 - walletDebit,
          isLoading: false,
        },
        checkoutReceipt: { totalRaw: 0n },
        selectedToken: 'USDC',
      })

      expect(screen.getByText('Existing balance')).toBeVisible()
      expect(
        screen
          .getByRole('heading', { hidden: true, name: 'Pay with' })
          .closest('[hidden]') === null,
      ).toBe(isPickerShown)
    },
  )

  it('shows the loading box until the first quote lands', () => {
    renderPicker({ isQuotingFunding: true, selectedToken: 'USDC' })

    expect(screen.getByText('Loading balances…')).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Select USDC' }),
    ).not.toBeInTheDocument()
  })
  it('does not call a sub-cent debit fully covered', () => {
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

    expect(
      screen.getByText(
        'You do not have enough funds to complete this transaction.',
      ),
    ).toBeVisible()
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
    expect(receiptRow('You pay')).toHaveTextContent('$0.00')
  })

  it('totals the funded amount when no fee quote is available', () => {
    renderPicker({
      fundedAmount: 5.5,
      pricingData: 5,
      selectedToken: 'USDC',
      showNetworkFeeDetails: false,
    })

    expect(receiptRow('Total')).toHaveTextContent('$5.50')
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

    expect(screen.getByText('Est. fee: —')).toBeVisible()
    expect(receiptRow('Total')).toHaveTextContent('$330.00')
    expect(screen.getByRole('button', { name: 'Register name' })).toBeEnabled()
    expect(screen.queryByText('up to')).not.toBeInTheDocument()
  })

  it('offers only a retry, with no figures, when the required quote failed', () => {
    const onRetry = vi.fn()
    renderPicker({ hasBudgetQuoteFailed: true, onRetry, selectedToken: 'USDC' })

    expect(receiptRow('Total')).toHaveTextContent('—')
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
    expect(screen.getByText('Est. fee: $4.32')).toBeVisible()
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

describe('TokenPickerContentBase while a payment is in flight', () => {
  const picker = (
    props: Partial<Parameters<typeof TokenPickerContentBase>[0]>,
  ) => (
    <I18nProvider i18n={i18n}>
      <TokenPickerContentBase
        isConnected
        isLoadingBalances={false}
        label="oranges"
        onNext={() => {}}
        onSelectCoin={() => {}}
        pricingData={0.75}
        pricingLoading={false}
        selectedToken="USDC"
        showNetworkFeeDetails
        stablecoinBalances={[usdc]}
        {...props}
      />
    </I18nProvider>
  )
  const owed = {
    registration: 0.75,
    networkFee: 0.1,
    total: 0.85,
    walletDebit: 0.04,
    hcaCredit: 0.81,
    isLoading: false,
  }
  // The payment landed in the account, which now covers it all.
  const covered = { ...owed, total: 0.84, walletDebit: 0, hcaCredit: 0.84 }

  it('keeps the figures the user confirmed until it settles', () => {
    const { rerender } = render(picker({ funding: owed }))
    rerender(picker({ funding: owed, isBusy: true }))
    rerender(picker({ funding: covered, isBusy: true }))

    expect(receiptRow('You pay')).toHaveTextContent('$0.04')
    expect(
      screen.queryByText(/No additional payment needed/),
    ).not.toBeInTheDocument()

    rerender(picker({ funding: covered }))
    expect(screen.getByText(/No additional payment needed/)).toBeVisible()
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
    isQuoteStale: false,
    hasQuoteFailed: false,
    ...overrides,
  })
  // One mock behind both selects, so a test sees every selection the picker makes.
  const l2PaymentOf = (
    rows: readonly L2PaymentRow[],
    selectedChainId: number | undefined = undefined,
  ) => {
    const onSelect = vi.fn()
    return {
      rows,
      selectedChainId,
      selectedOrigin: undefined,
      onSelect,
      onFallbackSelect: onSelect,
    }
  }
  const l2Payment = (
    row: L2PaymentRow,
    selectedChainId: number | undefined = undefined,
  ) => l2PaymentOf([row], selectedChainId)

  const shortL2Payment = () => {
    const shortRow = baseSepoliaRow('insufficient')
    return l2Payment({
      ...shortRow,
      option: { ...shortRow.option, balanceRaw: 2_000_000n },
    })
  }

  it('lists an L2 that holds USDC but cannot pay, and leaves the pick to the user', () => {
    const payment = shortL2Payment()
    renderPicker({
      funding: underfunded,
      selectedToken: 'USDC',
      stablecoinBalances: [emptyUsdc],
      l2Payment: payment,
      checkoutReceipt: { totalRaw: 5_000_000n },
    })

    const row = screen.getByRole('button', {
      name: 'Select USDC on Base Sepolia',
    })
    expect(row).toBeVisible()
    expect(payment.onSelect).not.toHaveBeenCalled()
    fireEvent.click(row)
    expect(payment.onSelect).toHaveBeenCalledWith(baseSepolia.id)
  })

  const failedQuoteRow = () =>
    baseSepoliaRow('available', { hasQuoteFailed: true })

  it('lists an L2 holding USDC whose quote failed, without moving to it', () => {
    const payment = l2Payment(failedQuoteRow())
    renderPicker({
      funding: underfunded,
      selectedToken: 'USDC',
      stablecoinBalances: [emptyUsdc],
      l2Payment: payment,
      checkoutReceipt: { totalRaw: 5_000_000n },
    })

    expect(
      screen.getByRole('button', { name: 'Select USDC on Base Sepolia' }),
    ).toBeVisible()
    expect(payment.onSelect).not.toHaveBeenCalled()
  })

  it('says a picked L2 whose quote failed cannot be used right now', () => {
    renderPicker({
      funding: underfunded,
      selectedToken: 'USDC',
      stablecoinBalances: [emptyUsdc],
      l2Payment: l2Payment(failedQuoteRow(), baseSepolia.id),
      checkoutReceipt: { totalRaw: 5_000_000n },
    })

    expect(
      screen.getByText("Paying from Base Sepolia isn't available right now."),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Register name' })).toBeDisabled()
  })

  it('keeps an unquoted L2 hidden in renewal', () => {
    renderPicker({
      funding: underfunded,
      selectedToken: 'USDC',
      stablecoinBalances: [emptyUsdc],
      l2Payment: l2Payment(failedQuoteRow()),
    })

    expect(
      screen.queryByRole('button', { name: 'Select USDC on Base Sepolia' }),
    ).not.toBeInTheDocument()
  })

  it('hides the methods while the caller asks it to', () => {
    renderPicker({
      funding: underfunded,
      selectedToken: 'USDC',
      stablecoinBalances: [usdc],
      isMethodListHidden: true,
    })

    expect(
      screen
        .getByRole('heading', { hidden: true, name: 'Pay with' })
        .closest('[hidden]'),
    ).not.toBeNull()
  })

  it('labels the checkout total as a caller asks', () => {
    renderPicker({
      funding: underfunded,
      selectedToken: 'USDC',
      stablecoinBalances: [usdc],
      checkoutReceipt: { totalRaw: 5_000_000n, totalLabel: 'Renewal total' },
    })

    expect(screen.getByText('Renewal total')).toBeVisible()
    expect(screen.queryByText('Registration total')).not.toBeInTheDocument()
  })

  it('explains what happens to the network fee the fill does not use', async () => {
    renderPicker({
      funding: underfunded,
      selectedToken: 'USDC',
      stablecoinBalances: [usdc],
      checkoutReceipt: { totalRaw: 5_000_000n },
    })

    fireEvent.focus(
      screen.getByRole('button', { name: 'What is the network fee?' }),
    )

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'stays there, as existing balance for your next payment',
    )
  })

  it('in registration, says a picked short L2 lacks USDC and estimates its fee', () => {
    renderPicker({
      funding: underfunded,
      selectedToken: 'USDC',
      stablecoinBalances: [emptyUsdc],
      l2Payment: { ...shortL2Payment(), selectedChainId: baseSepolia.id },
      checkoutReceipt: { totalRaw: 5_000_000n },
    })

    expect(
      screen.getByText('You do not have enough USDC for this transaction.'),
    ).toBeVisible()
    expect(screen.getByText('Est. fee: ~$0.20')).toBeVisible()
  })

  it('keeps a short L2 hidden in renewal', () => {
    renderPicker({
      funding: underfunded,
      selectedToken: 'USDC',
      stablecoinBalances: [emptyUsdc],
      l2Payment: shortL2Payment(),
    })

    expect(
      screen.queryByRole('button', { name: 'Select USDC on Base Sepolia' }),
    ).not.toBeInTheDocument()
  })

  it('lists an L2 next to a wallet that cannot pay, and selects it on click', () => {
    const payment = l2Payment(
      baseSepoliaRow('available', { amountInRaw: 5_012_573n }),
    )
    renderPicker({
      funding: underfunded,
      selectedToken: 'USDC',
      stablecoinBalances: [emptyUsdc],
      l2Payment: payment,
    })
    // The fallback already picked it on mount; prove the click selects too.
    payment.onSelect.mockClear()

    fireEvent.click(
      screen.getByRole('button', { name: 'Select USDC on Base Sepolia' }),
    )
    expect(payment.onSelect).toHaveBeenCalledWith(baseSepolia.id)
    expect(screen.getByRole('button', { name: 'Register name' })).toBeDisabled()
  })

  it('leaves the method alone while a click is in flight', () => {
    const payment = l2Payment(
      baseSepoliaRow('available', { amountInRaw: 5_012_573n }),
    )
    renderPicker({
      funding: underfunded,
      isBusy: true,
      selectedToken: 'USDC',
      stablecoinBalances: [emptyUsdc],
      l2Payment: payment,
    })

    expect(payment.onSelect).not.toHaveBeenCalled()
  })

  it.each([
    { balance: '1000000', label: 'Register name', isEnabled: false },
    { balance: '1000000000', label: 'Sign approval', isEnabled: true },
  ])(
    'labels the button $label when the wallet holds $balance',
    ({ balance, label, isEnabled }) => {
      renderPicker({
        funding: underfunded,
        nextMessage: 'Sign approval',
        selectedToken: 'USDC',
        shortfallLabel: 'Register name',
        stablecoinBalances: [{ ...usdc, balance }],
      })

      expect(
        screen.getByRole('button', { name: label }).hasAttribute('disabled'),
      ).toBe(!isEnabled)
    },
  )

  it.each([
    { origin: 'user' as const, isKept: true },
    { origin: undefined, isKept: false },
  ])(
    'keeps a short wallet coin only when the user picked it ($origin)',
    ({ origin, isKept }) => {
      const payment = {
        ...l2Payment(baseSepoliaRow('available', { amountInRaw: 5_012_573n })),
        selectedOrigin: origin,
      }
      renderPicker({
        funding: underfunded,
        selectedToken: 'USDC',
        stablecoinBalances: [{ ...usdc, balance: '1000000' }],
        l2Payment: payment,
      })

      expect(screen.getByRole('button', { name: 'Select USDC' })).toBeVisible()
      expect(payment.onSelect).toHaveBeenCalledTimes(isKept ? 0 : 1)
      expect(
        screen.queryByText(
          'You do not have enough USDC for this transaction.',
        ) !== null,
      ).toBe(isKept)
    },
  )

  it('with nothing chosen, picks a wallet coin that can pay over a bigger L2', () => {
    const row = baseSepoliaRow('available', { amountInRaw: 5_012_573n })
    const payment = l2Payment({
      ...row,
      option: { ...row.option, balanceRaw: 5_000_000_000n },
    })
    const onSelectCoin = renderPicker({
      funding: underfunded,
      selectedToken: undefined,
      stablecoinBalances: [usdc],
      l2Payment: payment,
    })

    expect(onSelectCoin).toHaveBeenCalledWith('USDC', 'fallback')
    expect(payment.onSelect).not.toHaveBeenCalled()
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

    expect(screen.getByText('Est. fee: $0.21')).toBeVisible()
    expect(receiptRow('Total')).toHaveTextContent('$5.01')
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
      l2Payment: l2PaymentOf([quoted, op], optimismSepolia.id),
    })

    expect(screen.getByText('Est. fee: ~$0.21')).toBeVisible()
    expect(
      screen.getByText('About $2.01 more needed on OP Sepolia.'),
    ).toBeVisible()
  })

  it('waits for every L2 re-quote before picking the one holding the most', () => {
    const base = baseSepoliaRow('available', {
      amountInRaw: 5_012_573n,
      isQuoteStale: true,
    })
    const op = {
      ...baseSepoliaRow('available', { amountInRaw: 5_012_573n }),
      option: {
        ...base.option,
        id: l2PaymentOptionId(optimismSepolia.id),
        source: { ...base.option.source, chain: optimismSepolia },
        balanceRaw: 10_000_000n,
      },
    }
    const payment = l2PaymentOf([op, base])
    renderPicker({
      funding: underfunded,
      selectedToken: 'USDC',
      stablecoinBalances: [emptyUsdc],
      l2Payment: payment,
    })

    expect(payment.onSelect).not.toHaveBeenCalled()
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

  describe('an empty L2, with nothing left to bridge', () => {
    const covered = { ...underfunded, walletDebit: 0, hcaCredit: 5 }
    const emptyRow = () => {
      const row = baseSepoliaRow('available', { amountInRaw: 0n })
      return { ...row, option: { ...row.option, balanceRaw: 0n } }
    }

    it('is not listed', () => {
      renderPicker({
        funding: covered,
        selectedToken: undefined,
        l2Payment: l2Payment(emptyRow()),
      })

      expect(
        screen.queryByRole('button', { name: 'Select USDC on Base Sepolia' }),
      ).not.toBeInTheDocument()
    })

    it('is not listed or paid from once chosen, and the wallet takes over', () => {
      const payment = l2Payment(emptyRow(), baseSepolia.id)
      const onSelectCoin = renderPicker({
        funding: covered,
        selectedToken: 'USDC',
        l2Payment: payment,
      })

      expect(
        screen.queryByRole('button', { name: 'Select USDC on Base Sepolia' }),
      ).not.toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Register name' }),
      ).toBeDisabled()
      expect(onSelectCoin).toHaveBeenCalledWith('USDC', 'fallback')
    })
  })

  // A share of 0 is "covered" by any coin, an empty one included.
  describe('an empty wallet coin, with the account covering it all', () => {
    const covered = { ...underfunded, walletDebit: 0, hcaCredit: 5 }
    const nothingToBridge = () =>
      baseSepoliaRow('available', { amountInRaw: 0n })

    // A renewal retried after its bridge landed, still paying from the L2.
    it('is not listed', () => {
      renderPicker({
        funding: covered,
        selectedToken: 'USDC',
        stablecoinBalances: [emptyUsdc],
        l2Payment: l2Payment(nothingToBridge(), baseSepolia.id),
      })

      expect(
        screen.queryByRole('button', { name: 'Select USDC' }),
      ).not.toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Select USDC on Base Sepolia' }),
      ).toBeVisible()
    })

    it('still pays nothing once chosen, rather than giving way to the L2', () => {
      const payment = l2Payment(nothingToBridge())
      renderPicker({
        funding: covered,
        selectedToken: 'USDC',
        stablecoinBalances: [emptyUsdc],
        l2Payment: payment,
      })

      expect(screen.getByText(/No additional payment needed/)).toBeVisible()
      expect(
        screen.getByRole('button', { name: 'Register name' }),
      ).toBeEnabled()
      expect(payment.onSelect).not.toHaveBeenCalled()
    })
  })
})

describe('TokenPickerContentBase ETH row', () => {
  const underfunded = {
    registration: 4.8,
    networkFee: 0.2,
    total: 5,
    walletDebit: 5,
    hcaCredit: 0,
    isLoading: false,
  }
  const ethPaymentOf = (
    row: Partial<EthPaymentRow> = {},
    isSelected = false,
  ) => ({
    row: {
      chargeRaw: 2_600_000_000_000_000n,
      balanceRaw: 10n ** 18n,
      gasReserveRaw: 0n,
      walletUsdcRaw: 0n,
      ethUsdRaw: undefined,
      isQuoteLoading: false,
      hasQuoteFailed: false,
      ...row,
    },
    isSelected,
    onSelect: vi.fn(),
    onFallbackSelect: vi.fn(),
  })

  it('lists ETH next to a wallet that cannot pay, and selects it on click', () => {
    const ethPayment = ethPaymentOf()
    renderPicker({
      funding: underfunded,
      selectedToken: 'USDC',
      stablecoinBalances: [emptyUsdc],
      ethPayment,
    })

    expect(screen.getByText('Swaps up to 0.0026 ETH')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Pay with ETH' }))
    expect(ethPayment.onSelect).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Register name' })).toBeDisabled()
  })

  it.each([
    ['nothing to swap', 0n, false],
    ['a swap to make', 2_600_000_000_000_000n, true],
  ])(
    'with a wallet that pays in USDC, lists ETH only with %s',
    (_case, chargeRaw, isListed) => {
      renderPicker({
        funding: underfunded,
        selectedToken: 'USDC',
        stablecoinBalances: [usdc],
        ethPayment: ethPaymentOf({ chargeRaw }),
      })

      expect(
        screen.queryByRole('button', { name: 'Pay with ETH' }) !== null,
      ).toBe(isListed)
    },
  )

  it('moves to ETH when nothing else can pay, without blaming the empty USDC', () => {
    const ethPayment = ethPaymentOf()
    renderPicker({
      funding: underfunded,
      selectedToken: 'USDC',
      stablecoinBalances: [emptyUsdc],
      ethPayment,
    })

    expect(ethPayment.onFallbackSelect).toHaveBeenCalledOnce()
    expect(ethPayment.onSelect).not.toHaveBeenCalled()
    expect(
      screen.queryByText('You do not have enough USDC for this transaction.'),
    ).not.toBeInTheDocument()
  })

  it('moves to ETH, short as it is, rather than blaming a USDC row the list hides', () => {
    const ethPayment = ethPaymentOf({ balanceRaw: 1_000_000_000_000_000n })
    renderPicker({
      funding: underfunded,
      selectedToken: 'USDC',
      stablecoinBalances: [emptyUsdc],
      ethPayment,
    })

    expect(ethPayment.onFallbackSelect).toHaveBeenCalledOnce()
    expect(
      screen.queryByText('You do not have enough USDC for this transaction.'),
    ).not.toBeInTheDocument()
  })

  it('shows the most the swap sends as what the wallet pays, with ETH selected', () => {
    renderPicker({
      funding: underfunded,
      selectedToken: 'USDC',
      stablecoinBalances: [emptyUsdc],
      ethPayment: ethPaymentOf({ ethUsdRaw: 200_000_000_000n }, true),
      checkoutReceipt: { totalRaw: 5_000_000n },
    })

    expect(receiptRow('You pay')).toHaveTextContent('up to')
    expect(receiptRow('You pay')).toHaveTextContent('$5.20')
  })

  it('shows the ETH the swap sends, and the USDC the wallet spends first, as what it pays', () => {
    renderPicker({
      funding: underfunded,
      selectedToken: 'USDC',
      stablecoinBalances: [emptyUsdc],
      ethPayment: ethPaymentOf(
        { ethUsdRaw: 200_000_000_000n, walletUsdcRaw: 3_200_000n },
        true,
      ),
      checkoutReceipt: { totalRaw: 5_000_000n },
    })

    expect(receiptRow('You pay')).toHaveTextContent(
      /3\.20\s*USDC\s*\+\s*up to\s*0\.0026\s*ETH/,
    )
    expect(receiptRow('You pay')).toHaveTextContent('≈ $8.40 USD')
  })

  it('stays on a wallet coin that can pay rather than swapping ETH', () => {
    const ethPayment = ethPaymentOf()
    renderPicker({
      funding: underfunded,
      selectedToken: 'USDC',
      stablecoinBalances: [usdc],
      ethPayment,
    })

    expect(ethPayment.onFallbackSelect).not.toHaveBeenCalled()
  })

  it('keeps the methods as they were clicked while paying', () => {
    const ethPayment = ethPaymentOf({}, true)
    const sheet = (
      props: Partial<Parameters<typeof TokenPickerContentBase>[0]>,
    ) => (
      <I18nProvider i18n={i18n}>
        <TokenPickerContentBase
          ethPayment={ethPayment}
          funding={underfunded}
          isConnected
          isLoadingBalances={false}
          label="jeff"
          onNext={() => {}}
          onSelectCoin={() => {}}
          pricingData={330}
          pricingLoading={false}
          selectedToken="USDC"
          showNetworkFeeDetails
          stablecoinBalances={[emptyUsdc]}
          {...props}
        />
      </I18nProvider>
    )
    const { rerender } = render(sheet({}))
    rerender(sheet({ isBusy: true }))
    // The swap lands: the wallet now holds USDC.
    rerender(sheet({ isBusy: true, stablecoinBalances: [usdc] }))

    expect(screen.getByRole('button', { name: 'Pay with ETH' })).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Select USDC' }),
    ).not.toBeInTheDocument()

    rerender(sheet({ stablecoinBalances: [usdc] }))
    expect(screen.getByRole('button', { name: 'Select USDC' })).toBeVisible()
  })

  it('registers with ETH once quoted, whatever USDC the wallet holds', () => {
    renderPicker({
      funding: underfunded,
      selectedToken: 'USDC',
      stablecoinBalances: [emptyUsdc],
      ethPayment: ethPaymentOf({}, true),
    })

    expect(screen.getByRole('button', { name: 'Register name' })).toBeEnabled()
  })

  it.each([
    ['still being quoted', { isQuoteLoading: true }],
    ['quoted on a stale amount', { isQuoteLoading: true, chargeRaw: 1n }],
    ['unavailable', { hasQuoteFailed: true }],
  ])('holds checkout while the ETH payment is %s', (_case, row) => {
    renderPicker({
      funding: underfunded,
      selectedToken: 'USDC',
      stablecoinBalances: [emptyUsdc],
      ethPayment: ethPaymentOf(row, true),
    })

    expect(screen.getByRole('button', { name: 'Register name' })).toBeDisabled()
  })

  it.each([
    [
      'the swap',
      { balanceRaw: 1_000_000_000_000_000n },
      'You need 0.0016 ETH more for the swap and its gas.',
    ],
    [
      'the swap and its gas',
      {
        balanceRaw: 2_600_000_000_000_000n,
        gasReserveRaw: 100_000_000_000_000n,
      },
      'You need 0.0001 ETH more for the swap and its gas.',
    ],
  ])(
    'holds checkout and says how much when the wallet is short of %s',
    (_case, row, message) => {
      renderPicker({
        funding: underfunded,
        selectedToken: 'USDC',
        stablecoinBalances: [emptyUsdc],
        ethPayment: ethPaymentOf(row, true),
      })

      expect(screen.getByText(message)).toBeVisible()
      expect(
        screen.getByRole('button', { name: 'Register name' }),
      ).toBeDisabled()
    },
  )

  it('keeps a chosen ETH payment rather than falling back to the wallet', () => {
    const onSelectCoin = renderPicker({
      funding: underfunded,
      selectedToken: 'USDC',
      stablecoinBalances: [usdc],
      l2Payment: {
        rows: [],
        selectedChainId: undefined,
        selectedOrigin: undefined,
        onSelect: vi.fn(),
        onFallbackSelect: vi.fn(),
      },
      ethPayment: ethPaymentOf({}, true),
    })

    expect(onSelectCoin).not.toHaveBeenCalled()
  })
})
