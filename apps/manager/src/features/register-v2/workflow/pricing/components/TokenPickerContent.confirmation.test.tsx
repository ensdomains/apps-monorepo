import '@testing-library/jest-dom'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { StablecoinBalance } from '@/lib/smart-account'
import { TokenPickerContent } from './TokenPickerContent'

const mocks = vi.hoisted(() => ({
  renderBudget: {
    total: 5_000_000n,
    registrationPrice: 4_800_000n,
    hcaBalance: 0n,
  },
  fetchQuery: vi.fn<(options: unknown) => Promise<unknown>>(),
  send: vi.fn(),
  getSnapshot: vi.fn<() => object>(),
  getSessionEnablePayload: vi.fn<() => Promise<undefined>>(),
}))

vi.mock('@xstate/react', () => ({
  useSelector: (actor: unknown, select: (state: unknown) => unknown) =>
    actor
      ? select({
          matches: () => false,
          context: {
            duration: 31_536_000,
            selectedToken: 'USDC',
            fundingSourceChainId: undefined,
            fundingSourceOrigin: undefined,
            paymentAsset: undefined,
            approvalOutcome: 'none',
            lastErrorMessage: undefined,
            confirmedData: undefined,
            hcaPrimaryName: false,
            postRegistrationSetup: undefined,
          },
        })
      : select(undefined),
}))

vi.mock('../../../state/registrationUi.context', () => ({
  useRegistrationV2Context: () => ({
    label: 'jeff',
    uiActor: {
      send: mocks.send,
      getSnapshot: mocks.getSnapshot,
    },
    registrationActor: undefined,
  }),
}))

vi.mock('@/lib/smart-account/useSmartAccountBalances', () => ({
  HCA_PAYMENT_TOKEN: '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238',
}))

const walletUsdc = {
  address: '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238',
  symbol: 'USDC',
  decimals: 6,
  balance: '100000000',
  formattedBalance: '100',
} satisfies StablecoinBalance

vi.mock('@/lib/smart-account/SmartAccountContext', () => ({
  useSmartAccountContext: () => ({
    accountAddress: '0x0000000000000000000000000000000000000001',
    ownerAddress: null,
    signer: { type: 'rhinestone', account: { config: {} } },
    stablecoinBalances: [walletUsdc],
    isLoadingBalances: false,
    isConnected: true,
    getSessionEnablePayload: mocks.getSessionEnablePayload,
  }),
}))

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => vi.fn(),
  useSearch: () => ({ referrer: '0x1234' }),
}))

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...original,
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
          data: { commitCost: 0n, ...mocks.renderBudget },
          isError: false,
          isLoading: false,
          isFetching: false,
          isPending: false,
          isPlaceholderData: false,
        }
      }
      return {
        data: undefined,
        isError: false,
        isLoading: false,
        isFetching: false,
        isPending: false,
        isPlaceholderData: false,
      }
    },
    useQueries: ({ queries }: { queries: readonly unknown[] }) =>
      queries.map(() => ({
        data: undefined,
        isError: false,
        isLoading: false,
        isPlaceholderData: false,
      })),
    useQueryClient: () => ({ fetchQuery: mocks.fetchQuery }),
  }
})

i18n.loadAndActivate({ locale: 'en', messages: {} })

const renderPicker = (queryClient: QueryClient) => (
  <QueryClientProvider client={queryClient}>
    <I18nProvider i18n={i18n}>
      <TokenPickerContent />
    </I18nProvider>
  </QueryClientProvider>
)

beforeEach(() => {
  mocks.renderBudget = {
    total: 5_000_000n,
    registrationPrice: 4_800_000n,
    hcaBalance: 0n,
  }
  mocks.fetchQuery.mockReset()
  mocks.send.mockReset()
  const snapshot = {}
  mocks.getSnapshot.mockReset().mockReturnValue(snapshot)
  mocks.getSessionEnablePayload.mockReset().mockResolvedValue(undefined)
})

it('starts with the payment figures that were visible at the click', async () => {
  let finishAvailability: () => void = () => {
    throw new Error('Availability check has not started')
  }
  const availability = new Promise<{ readonly isAvailable: true }>(
    (resolve) => {
      finishAvailability = () => resolve({ isAvailable: true })
    },
  )
  mocks.fetchQuery
    .mockResolvedValueOnce(mocks.renderBudget)
    .mockReturnValueOnce(availability)

  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  const view = render(renderPicker(queryClient))
  fireEvent.click(screen.getByRole('button', { name: 'Sign approval' }))
  await waitFor(() => expect(mocks.fetchQuery).toHaveBeenCalledTimes(2))

  mocks.renderBudget = {
    total: 6_000_000n,
    registrationPrice: 4_800_000n,
    hcaBalance: 0n,
  }
  view.rerender(renderPicker(queryClient))
  finishAvailability()

  await waitFor(() => expect(mocks.send).toHaveBeenCalledOnce())
  expect(mocks.send).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'registration.start',
      displayedWalletDebit: 5_000_000n,
    }),
  )
})
