import '@testing-library/jest-dom'
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
      context: { duration: number; selectedToken: string }
    }) => unknown,
  ) => select({ context: { duration: 31_536_000, selectedToken: 'USDC' } }),
}))

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => vi.fn(),
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
  "We couldn't work out the full cost of this registration right now, so we can't start it safely. Please try again in a moment."

/** 1,000 USDC — comfortably above the 330 rent. */
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
  }> = {},
) =>
  smartAccountMock.useSmartAccountContext.mockReturnValue({
    accountAddress: '0x000000000000000000000000000000000000dEaD',
    ownerAddress: null,
    signer: { type: 'rhinestone' },
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

    // The wallet covers the rent, so only the failed quote can block here.
    expect(await screen.findByText(QUOTE_FAILED_MESSAGE)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Register name' })).toBeDisabled()
    expect(screen.getByText('up to')).toBeInTheDocument()
  })

  it('does not gate the EOA route, which never quotes a budget', async () => {
    mockAccount({ signer: { type: 'eoa' }, accountAddress: null })
    renderConnectedPicker()

    // Enabled once the rent lands; the budget query never runs on this route.
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Register name' }),
      ).toBeEnabled(),
    )
    expect(screen.queryByText(QUOTE_FAILED_MESSAGE)).not.toBeInTheDocument()
  })
})
