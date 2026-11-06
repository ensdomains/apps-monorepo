import '@testing-library/jest-dom'
import { HcaBudgetUnquotedError } from '@ens-apps/smart-account'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HCA_PAYMENT_TOKEN } from '@/lib/smart-account/useSmartAccountBalances'

// Drives the connected `TokenPickerContent`, so the budget-failure flag is
// derived from a real budget query rather than handed in as a prop.

const smartAccountMock = vi.hoisted(() => ({
  useSmartAccountContext: vi.fn(),
}))

vi.mock('@/lib/smart-account/SmartAccountContext', () => smartAccountMock)

vi.mock('../../../state/registrationUi.context', () => ({
  useRegistrationV2Context: () => ({ label: 'jeff', uiActor: {} }),
}))

vi.mock('@xstate/react', () => ({
  useSelector: (
    _actor: unknown,
    select: (state: {
      matches: () => boolean
      context: { duration: number; selectedToken: string }
    }) => unknown,
  ) =>
    _actor
      ? select({
          matches: () => false,
          context: { duration: 31_536_000, selectedToken: 'USDC' },
        })
      : undefined,
}))

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => vi.fn(),
  useSearch: () => ({ referrer: '0x1234' }),
}))

vi.mock('../../../data/queries/pricing.query', () => ({
  getRegisterPriceQueryOptions: () => ({
    queryKey: ['register-price'],
    queryFn: async () => ({ basePrice: 330_000_000n, premium: 0n }),
  }),
}))

vi.mock('@/features/profile/service/profileReverseName', () => ({
  profileReverseNameQuery: () => ({
    queryKey: ['reverse-name'],
    queryFn: async () => null,
    enabled: false,
  }),
}))

vi.mock('@/features/shared/service/ownedNamesCount', () => ({
  ownedNamesCountQueryOptions: () => ({
    queryKey: ['owned-names-count'],
    queryFn: async () => 0,
    enabled: false,
  }),
}))

import { TokenPickerContent } from './TokenPickerContent'

i18n.loadAndActivate({ locale: 'en', messages: {} })

const QUOTE_FAILED_MESSAGE =
  "We couldn't calculate the total. Please try again."

/** 1,000 USDC — comfortably above the 330 price. */
const usdc = {
  address: HCA_PAYMENT_TOKEN,
  symbol: 'USDC',
  decimals: 6,
  balance: '1000000000',
}

const mockAccount = (
  overrides: Partial<{
    signer: { type: string } | null
    accountAddress: string | null
    getSessionEnablePayload: () => Promise<unknown>
  }> = {},
) =>
  smartAccountMock.useSmartAccountContext.mockReturnValue({
    accountAddress: '0x000000000000000000000000000000000000dEaD',
    ownerAddress: null,
    signer: { type: 'rhinestone', account: { config: {} } },
    stablecoinBalances: [usdc],
    isLoadingBalances: false,
    isConnected: true,
    // The first thing the budget quote awaits, so rejecting it fails the
    // query through its real `queryFn`.
    getSessionEnablePayload: vi
      .fn()
      .mockRejectedValue(new Error('orchestrator unavailable')),
    ...overrides,
  })

const receiptRow = (label: string) => {
  const row = screen.getByText(label).closest('div')
  if (!row) throw new Error(`No receipt row for ${label}`)
  return row
}

const renderConnectedPicker = () => {
  const queryClient = new QueryClient({
    // The budget query retries once; don't wait out the backoff.
    defaultOptions: { queries: { retryDelay: 0 } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider i18n={i18n}>
        <TokenPickerContent />
      </I18nProvider>
    </QueryClientProvider>,
  )
}

describe('TokenPickerContent budget quote', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('blocks checkout on the HCA route when the budget query errors', async () => {
    mockAccount()
    renderConnectedPicker()

    // The wallet covers the price, so only the failed quote can block here.
    expect(await screen.findByText(QUOTE_FAILED_MESSAGE)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled()
    expect(
      screen.queryByRole('button', { name: /approv|register/i }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('$330.00')).not.toBeInTheDocument()
  })

  it('shows the fallback estimate on a gas-coverage refusal and still blocks checkout', async () => {
    mockAccount({
      // Any failure in the quote pipeline reaches the sheet through the same cause chain.
      getSessionEnablePayload: vi.fn().mockRejectedValue(
        new HcaBudgetUnquotedError({
          total: 340_000_000n,
          commitCost: 5_000_000n,
          registerCost: 5_000_000n,
          registrationPrice: 330_000_000n,
          expectedMaximum: 400_000_000n,
          source: 'fallback',
          fallbackReasons: [
            'commit: quote threw — No available destination-chain balance can cover execution gas.',
          ],
        }),
      ),
    })
    renderConnectedPicker()

    expect(
      await screen.findByText(
        /Network fees are elevated right now, so the total above is an estimate \(about \$340\.00\)\. Try again shortly for a confirmed quote before paying\./,
      ),
    ).toBeInTheDocument()
    // The warning carries the explanation; nothing is added under the receipt.
    expect(screen.queryByText(/^This total is an estimate/)).toBeNull()
    // No quote ever succeeded, so the whole receipt comes from the estimate.
    expect(receiptRow('Registration total')).toHaveTextContent('$330.00')
    expect(receiptRow('Estimated network fee')).toHaveTextContent('$10.00')
    expect(receiptRow('You pay')).toHaveTextContent('$340.00')
    expect(screen.queryByText(QUOTE_FAILED_MESSAGE)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled()
    expect(
      screen.queryByRole('button', { name: /approv|register/i }),
    ).not.toBeInTheDocument()
  })

  it('does not gate the EOA route, which never quotes a budget', async () => {
    mockAccount({ signer: { type: 'eoa' }, accountAddress: null })
    renderConnectedPicker()

    // Enabled once the price lands; the budget query never runs on this route.
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Approve and register' }),
      ).toBeEnabled(),
    )
    expect(screen.queryByText(QUOTE_FAILED_MESSAGE)).not.toBeInTheDocument()
  })
})
