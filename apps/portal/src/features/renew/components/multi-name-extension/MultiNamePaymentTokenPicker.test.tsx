import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createTestQueryClient } from '@/test-utils/providers'
import { mockWagmiConfig } from '@/test-utils/wagmi.mock'
import { MultiNamePaymentTokenPicker } from './MultiNamePaymentTokenPicker'

vi.mock('wagmi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wagmi')>()),
  useConfig: () => mockWagmiConfig,
  useConnection: () => ({ address: undefined }),
}))

vi.mock('@/features/register/hooks/useRenewalPrice', () => ({
  getRenewalPriceQueryOptions: ({
    name,
    token,
  }: {
    readonly name: string
    readonly token: string
  }) => ({
    queryKey: ['renewalPrice', name, token],
    queryFn: () => ({
      base: 5n,
      premium: 0n,
      total: 5n,
      decimals: 6,
      hasPremium: false,
    }),
  }),
}))

describe('MultiNamePaymentTokenPicker', () => {
  it('asks a disconnected visitor to connect rather than reporting no balance', async () => {
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <MultiNamePaymentTokenPicker
          renewals={[
            {
              selectedName: { name: 'one.eth', isV2: true },
              duration: 31_536_000,
            },
          ]}
          onSelectionChange={() => {}}
        />
      </QueryClientProvider>,
    )

    expect(await screen.findByText('Wallet not connected')).toBeInTheDocument()
    expect(screen.queryByText('Insufficient balance')).not.toBeInTheDocument()
  })
})
