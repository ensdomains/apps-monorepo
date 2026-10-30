import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { envConfig } from '@/config'
import { useCommemorativeNftMigrationCompletion } from './useCommemorativeNftMigrationCompletion'

const OWNER = '0x0000000000000000000000000000000000000001'
const HCA = '0x0000000000000000000000000000000000000002'
const mocks = vi.hoisted(() => ({
  owner: '0x0000000000000000000000000000000000000001',
  chain: 0,
  eligibility: {
    eligibilityUpdatedAt: 1,
    isPending: false,
    isEligibilityError: false,
    eligible: ['alice.eth'],
    recoveryState: { status: 'none' },
  },
  verify: vi.fn(),
}))
vi.mock('wagmi', () => ({
  useChainId: () => mocks.chain,
  useConfig: () => ({}),
}))
vi.mock('@/lib/smart-account', () => ({
  useSmartAccountContext: () => ({
    ownerAddress: mocks.owner,
    accountAddress: HCA,
  }),
}))
vi.mock('../hooks/useEligibleV1Names', () => ({
  useEligibleV1Names: () => mocks.eligibility,
}))
vi.mock('../service/migrationBatchJournal', () => ({
  getMigrationBatchJournalRevision: () => 0,
  getServerMigrationBatchJournalRevision: () => 0,
  subscribeMigrationBatchJournal: () => () => {},
}))
vi.mock('./verifiedMigration', () => ({
  verifiedNftMigrationQueryOptions: () => ({
    queryKey: ['verified'],
    queryFn: () => null,
  }),
}))
vi.mock('./migrationCompletion', () => ({
  commemorativeNftMigrationCompletionQueryOptions: ({
    ownerAddress,
    chainId,
  }: {
    ownerAddress: string
    chainId: number
  }) => ({
    queryKey: ['completion', ownerAddress, chainId],
    queryFn: mocks.verify,
  }),
}))

const run = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = ({ children }: { readonly children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return renderHook(
    () =>
      useCommemorativeNftMigrationCompletion({
        ownerAddress: OWNER,
        enabled: true,
      }),
    { wrapper },
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.owner = OWNER
  mocks.chain = envConfig.chain.id
  mocks.eligibility = {
    eligibilityUpdatedAt: 1,
    isPending: false,
    isEligibilityError: false,
    eligible: ['alice.eth'],
    recoveryState: { status: 'none' },
  }
  mocks.verify.mockResolvedValue({
    isComplete: true,
    status: 'complete',
    remainingNameCount: 0,
    migratedNameCount: 1,
  })
})

describe('automatic NFT completion reads', () => {
  it('uses known remaining names only to block minting and keeps explicit checks fresh', async () => {
    const { result, rerender } = run()
    await waitFor(() => expect(result.current.status).toBe('incomplete'))
    expect(mocks.verify).not.toHaveBeenCalled()
    expect(result.current.isFreshComplete).toBe(false)
    await act(async () => {
      await result.current.recheck()
    })
    expect(mocks.verify).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(result.current.isFreshComplete).toBe(true))
    mocks.eligibility.eligibilityUpdatedAt = Date.now() + 1
    rerender()
    expect(result.current.isFreshComplete).toBe(false)
    expect(result.current.status).toBe('incomplete')
  })

  it('waits for verified eligibility instead of starting another walk', async () => {
    mocks.eligibility.isPending = true
    const { result, rerender } = run()
    expect(result.current.status).toBe('pending')
    expect(mocks.verify).not.toHaveBeenCalled()
    mocks.eligibility = { ...mocks.eligibility, isPending: false, eligible: [] }
    rerender()
    await waitFor(() => expect(result.current.isFreshComplete).toBe(true))
    expect(mocks.verify).toHaveBeenCalledTimes(1)
  })

  it.each(['error', 'empty', 'recovery', 'chain'] as const)(
    'requires independent verification for %s eligibility',
    async (kind) => {
      if (kind === 'error') mocks.eligibility.isEligibilityError = true
      if (kind === 'empty') mocks.eligibility.eligible = []
      if (kind === 'recovery')
        mocks.eligibility.recoveryState.status = 'recovering'
      if (kind === 'chain') mocks.chain += 1
      const { result } = run()
      await waitFor(() => expect(mocks.verify).toHaveBeenCalledTimes(1))
      if (kind !== 'chain')
        await waitFor(() => expect(result.current.isFreshComplete).toBe(true))
    },
  )

  it('does not verify or reuse another owner scope', async () => {
    mocks.owner = HCA
    const { result } = run()
    expect(result.current.isFreshComplete).toBe(false)
    expect(mocks.verify).not.toHaveBeenCalled()
    await expect(result.current.recheck()).rejects.toThrow('Reconnect')
  })
})
