import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const query = vi.hoisted(() => ({
  data: 10001n as bigint | null | undefined,
  isError: false,
  isLoading: false,
  isFetching: false,
  isSuccess: true,
}))
vi.mock('@tanstack/react-query', () => ({ useQuery: () => query }))
vi.mock('@/features/renew/data/queries/renewalFee.query', () => ({
  getRenewalFeeQueryOptions: () => ({}),
}))
vi.mock(
  '@ens-apps/transaction-manager/machines/registration/registration.actors',
  () => ({ authorizedPaymentAmount: (price: bigint) => price + price / 10n }),
)

import { useRenewalIntentFunding } from './useRenewalIntentFunding'

const params: Parameters<typeof useRenewalIntentFunding>[0] = {
  label: 'abc',
  duration: 31536000n,
  token: 'USDC',
  protocol: 'v2',
  renewerAddress: '0x0000000000000000000000000000000000000001',
  account: {
    signer: { type: 'rhinestone' } as never,
    ownerAddress: '0x0000000000000000000000000000000000000002',
  },
  pricing: { rawPrice: 8800000n },
  accountCreditRaw: { USDC: 3000000n },
}
beforeEach(() =>
  Object.assign(query, {
    data: 10001n,
    isError: false,
    isLoading: false,
    isFetching: false,
    isSuccess: true,
  }),
)
describe('renewal confirmed quote', () => {
  it('shows the exact ceiling that submission will enforce', () => {
    const { result } = renderHook(() => useRenewalIntentFunding(params))
    expect(result.current.displayedWalletDebitUsdc).toBe(6700000n)
    expect(result.current.funding?.walletDebit).toBe(6.7)
  })
  it('preserves a zero-dollar confirmation when the full quoted total is covered', () => {
    const { result } = renderHook(() =>
      useRenewalIntentFunding({
        ...params,
        accountCreditRaw: { USDC: 10000000n },
      }),
    )
    expect(result.current.displayedWalletDebitUsdc).toBe(0n)
    expect(result.current.funding?.walletDebit).toBe(0)
  })
  it.each([null, undefined])(
    'does not create consent from a missing quote',
    (data) => {
      Object.assign(query, { data, isError: true, isSuccess: false })
      const { result } = renderHook(() => useRenewalIntentFunding(params))
      expect(result.current.displayedWalletDebitUsdc).toBeUndefined()
      expect(result.current.hasQuoteFailed).toBe(true)
    },
  )
  it('blocks while the initial quote is loading', () => {
    Object.assign(query, {
      data: undefined,
      isLoading: true,
      isFetching: true,
      isSuccess: false,
    })
    const { result } = renderHook(() => useRenewalIntentFunding(params))
    expect(result.current.displayedWalletDebitUsdc).toBeUndefined()
    expect(result.current.isQuoting).toBe(true)
  })
})
