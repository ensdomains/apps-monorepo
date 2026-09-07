import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const ADDR = '0x55e55c649895940826a852820d9e1a076ec47b09'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  createFileRoute: () => (options: Record<string, unknown>) => ({
    ...options,
    useParams: () => ({ addr: ADDR }),
  }),
}))

vi.mock('wagmi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('wagmi')>()
  return {
    ...actual,
    useConnection: () => ({ address: ADDR }),
    useConfig: () => ({ chains: [], state: { chainId: 11155111 } }),
    useChainId: () => 11155111,
    useAccount: () => ({ address: ADDR, isConnected: true }),
  }
})

// The extend flow is a whole transaction stack; this route test is about how
// often the table's rows are rebuilt.
vi.mock('@ens-apps/transaction-manager', () => ({
  transactionManager: { cancelTransaction: vi.fn() },
}))
vi.mock('@/features/renew/hooks/useRenewalTransactions', () => ({
  useRenewalTransactions: () => ({
    transactions: [],
    startFlow: vi.fn(),
    startMultiFlow: vi.fn(),
    clearIncompatibleRenewalState: vi.fn(),
  }),
}))
vi.mock(
  '@/features/transaction-manager/hooks/useActiveTransactionState',
  () => ({
    useActiveTransactionState: () => undefined,
    isTransactionInFlight: () => false,
  }),
)
vi.mock('@/features/transaction-manager/hooks/useTransactionModal', () => ({
  useTransactionModal: () => ({ isOpen: false, openModal: vi.fn() }),
}))
vi.mock('@/features/transaction-manager/components/TransactionModal', () => ({
  TransactionModal: () => null,
}))
vi.mock('@/features/renew/hooks/useIsRenewable', () => ({
  useV1Renewable: () => ({ isRenewable: () => false, isLoading: false }),
}))

vi.mock('@/features/profile/components/NameAvatar', () => ({
  NameAvatar: () => null,
}))

// The defect this file exists for: a fresh rows array on every render makes
// TanStack Table recompute its row model, whose memo auto-resets the page
// index, which re-renders — forever. Counting the merge is counting renders.
let mergeCalls = 0
vi.mock('@/utils/names/mergeNamesData', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/utils/names/mergeNamesData')>()
  return {
    ...actual,
    mergeNamesData: (
      ...args: Parameters<typeof actual.mergeNamesData>
    ): ReturnType<typeof actual.mergeNamesData> => {
      mergeCalls++
      return actual.mergeNamesData(...args)
    },
  }
})

// Stable across calls, like a real query's cached data: the memo this test
// guards is keyed on these references.
const v1Names: never[] = []
const v2Names = [
  { name: 'test12345.eth', expiryDate: 1790000000, roleBitmap: 31n },
  { name: 'sugh004.eth', expiryDate: 1800000000, roleBitmap: 63n },
]

const settled = (data: unknown) => ({
  data,
  error: undefined,
  isLoading: false,
})

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>(
    '@tanstack/react-query',
  )
  return {
    ...actual,
    // Every badge and chip in the rows runs its own reads; none of them are
    // what this test measures.
    useQuery: () => settled(undefined),
    useQueries: ({
      queries,
    }: {
      queries: { queryKey: readonly unknown[] }[]
    }) =>
      queries.map(({ queryKey }) =>
        queryKey[0] === 'get-v2-names-with-roles-for-address'
          ? settled(v2Names)
          : settled(v1Names),
      ),
  }
})

const { Route } = await import('./names')
const NamesRoute = (Route as unknown as { component: () => React.ReactElement })
  .component

describe('addr names route', () => {
  it('keeps the table rows stable across a re-render', async () => {
    const { rerender } = render(<NamesRoute />)

    // Rendered twice: the desktop table and the mobile card list.
    expect(await screen.findAllByText('test12345.eth')).not.toHaveLength(0)

    const afterFirstPaint = mergeCalls
    rerender(<NamesRoute />)

    expect(mergeCalls).toBe(afterFirstPaint)
  })
})
