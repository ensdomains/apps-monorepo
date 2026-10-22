import { QueryClient } from '@tanstack/react-query'
import type { Address } from 'viem'
import { describe, expect, it, vi } from 'vitest'

const budgetQueryFn = vi.fn(async () => ({ total: 1n }))
const priceQueryFn = vi.fn(async () => ({ basePrice: 1n, premium: 0n }))

vi.mock('../data/queries/hcaBudget.query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../data/queries/hcaBudget.query')>()),
  getHcaBudgetQueryOptions: (params: { label: string }) => ({
    queryKey: ['budget', params.label],
    queryFn: budgetQueryFn,
  }),
}))
vi.mock('../data/queries/pricing.query', () => ({
  getRegisterPriceQueryOptions: (label: string) => ({
    queryKey: ['price', label],
    queryFn: priceQueryFn,
  }),
}))
const reverseQueryFn = vi.fn(async () => null)
vi.mock('@/features/profile/service/profileReverseName', () => ({
  profileReverseNameQuery: () => ({
    queryKey: ['reverse'],
    queryFn: reverseQueryFn,
  }),
}))
vi.mock('@/features/shared/service/ownedNamesCount', () => ({
  ownedNamesCountQueryOptions: () => ({
    queryKey: ['owned'],
    queryFn: async () => 0,
  }),
}))

const { warmRegistrationCheckout } = await import('./checkoutWarmup')

const OWNER = '0x1111111111111111111111111111111111111111' as Address
const HCA = '0x2222222222222222222222222222222222222222' as Address

const warm = (signer: { type: string } | null) =>
  warmRegistrationCheckout(new QueryClient(), {
    label: 'jeff',
    durationInSeconds: 31_536_000,
    token: 'USDC',
    account: {
      accountAddress: signer ? HCA : null,
      signer: signer as never,
      ownerAddress: OWNER,
      getSessionEnablePayload: async () => undefined,
    },
  })

describe('warmRegistrationCheckout', () => {
  it('fetches the price and, on the smart-account route, the budget', async () => {
    await warm({ type: 'rhinestone' })

    expect(priceQueryFn).toHaveBeenCalledOnce()
    expect(budgetQueryFn).toHaveBeenCalledOnce()
  })

  it('leaves the budget and its primary-name lookups alone on the EOA route', async () => {
    budgetQueryFn.mockClear()
    reverseQueryFn.mockClear()
    await warm({ type: 'eoa' })

    expect(budgetQueryFn).not.toHaveBeenCalled()
    expect(reverseQueryFn).not.toHaveBeenCalled()
  })
})
