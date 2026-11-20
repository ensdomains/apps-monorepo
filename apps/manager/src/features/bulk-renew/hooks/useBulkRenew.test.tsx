import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { createWalletClient, custom } from 'viem'
import { mainnet } from 'viem/chains'
import { expect, it, vi } from 'vitest'
import { useRenewalSigner } from '@/features/renew/hooks/useRenewalSigner'
import { useBulkRenew } from './useBulkRenew'

const OWNER = '0x1234567890123456789012345678901234567890'
const WALLET_CLIENT = createWalletClient({
  account: OWNER,
  chain: mainnet,
  transport: custom({ request: vi.fn() }),
})

vi.mock('@/lib/smart-account', () => ({
  useSmartAccountContext: () => ({
    isConnected: false,
    ownerAddress: OWNER,
    signer: null,
    walletClient: WALLET_CLIENT,
  }),
}))
vi.mock('wagmi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wagmi')>()),
  useConnection: () => ({
    isConnected: true,
    address: OWNER,
    connector: { id: 'walletConnect', uid: 'safe' },
  }),
}))
vi.mock('@ens-apps/transaction-manager', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ens-apps/transaction-manager')>()),
  checkIsSafeWallet: async () => true,
}))
vi.mock('@/features/register-v2/data/queries/baseRates.query', () => ({
  getBaseRatesQueryOptions: {
    queryKey: ['baseRates'],
    queryFn: async () => [1_000_000n],
  },
}))
vi.mock('@/features/register-v2/data/queries/pricing.query', () => ({
  getRenewPriceQueryOptions: (
    label: string,
    duration: number,
    token: string,
  ) => ({
    queryKey: ['renewPrice', { label, duration, token }],
    queryFn: async () => ({ amount: 5_000_000n }),
  }),
}))
vi.mock('@/features/profile/service/profileRecords', () => ({
  profileRecordsQuery: (name: string) => ({
    queryKey: ['profileRecords', { name }],
    queryFn: async () => ({ texts: [] }),
  }),
}))
vi.mock('@/features/renew/data/queries/renewalBalances.query', () => ({
  useRenewalBalances: () => ({
    wallet: [],
    accountCredit: {},
    accountCreditRaw: {},
    isLoading: false,
  }),
}))
vi.mock('@/features/renew/workflow/pricing/useRenewalIntentFunding', () => ({
  useRenewalIntentFunding: () => ({
    isIntentRoute: false,
    isQuoting: false,
  }),
}))
vi.mock('@/features/renew/workflow/pricing/useRenewalL2Payment', () => ({
  useRenewalL2Payment: () => undefined,
}))

it('lets a connected Safe pay for bulk renewal when HCA initialization failed', async () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const { result } = renderHook(
    () => ({
      signer: useRenewalSigner(),
      renewal: useBulkRenew({
        names: [
          {
            label: 'alice',
            name: 'alice.eth',
            displayName: 'alice.eth',
            currentExpiry: 1_800_000_000n,
          },
        ],
        selection: { kind: 'preset', years: 1 },
        selectedToken: 'USDC',
        open: true,
      }),
    }),
    { wrapper },
  )

  await waitFor(() => {
    expect(result.current.signer?.type).toBe('eoa')
    expect(result.current.renewal.payment.pricesReady).toBe(true)
  })
  expect(result.current.renewal.grandTotal).toBe(5)
  expect(result.current.renewal.payment.canProceed).toBe(true)
})
