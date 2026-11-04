import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import {
  type getProfileCreationEvent,
  getProfileCreationQueryOptions,
} from '@/features/profile/service/profileCreation'
import { render } from '@/utils/test-utils'
import { ExplorerHistoryLink } from './ExplorerHistoryLink'

const TRANSACTION_HASH = `0x${'12'.repeat(32)}` as const

describe('ExplorerHistoryLink', () => {
  it('links the creation entity to name history and its transaction action to the network block explorer', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { enabled: false } },
    })
    queryClient.setQueryData<ReturnType<typeof getProfileCreationEvent>>(
      getProfileCreationQueryOptions({ name: 'alice.eth' }).queryKey,
      () => ({
        createdAt: new Date('2025-10-25T00:00:00.000Z'),
        transactionHash: TRANSACTION_HASH,
      }),
    )
    const view = render(
      <QueryClientProvider client={queryClient}>
        <ExplorerHistoryLink
          href="https://sepolia.explorer.ens.domains/alice.eth/history"
          name="alice.eth"
        />
      </QueryClientProvider>,
    )

    expect(view.getByRole('link', { name: /Oct 25, 2025/ })).toHaveAttribute(
      'href',
      'https://sepolia.explorer.ens.domains/alice.eth/history',
    )
    expect(view.getByRole('link', { name: 'Etherscan' })).toHaveAttribute(
      'href',
      `https://sepolia.etherscan.io/tx/${TRANSACTION_HASH}`,
    )
  })
})
