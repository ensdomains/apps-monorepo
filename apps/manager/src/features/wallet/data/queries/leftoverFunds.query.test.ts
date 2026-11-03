import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { QueryClient } from '@tanstack/react-query'
import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'
import { getHcaBudgetQueryOptions } from '@/features/register-v2/data/queries/hcaBudget.query'
import { invalidateAfterWithdrawal } from './leftoverFunds.query'

const HCA: Address = '0xaaaa000000000000000000000000000000000001'
const OTHER_HCA: Address = '0xbbbb000000000000000000000000000000000002'

// The real key, so a change to its shape fails here rather than in checkout.
const budgetKey = (hca: Address) =>
  getHcaBudgetQueryOptions({
    label: 'leon',
    durationInSeconds: 31_536_000,
    hca,
    signer: null,
    primaryName: undefined,
    getSessionEnablePayload: async () => undefined,
  }).queryKey

describe('invalidateAfterWithdrawal', () => {
  it("drops this account's budget quotes and the wallet balances, nothing else", async () => {
    const queryClient = new QueryClient()
    const walletKey = $qk({ $scope: 'wallet', $action: 'stablecoinBalances' })
    const priceKey = $qk({ $scope: 'registration', $action: 'price' })
    for (const key of [
      budgetKey(HCA),
      budgetKey(OTHER_HCA),
      walletKey,
      priceKey,
    ]) {
      queryClient.setQueryData(key, 1)
    }

    await invalidateAfterWithdrawal(queryClient, HCA)

    const isInvalidated = (key: readonly unknown[]) =>
      queryClient.getQueryState(key)?.isInvalidated
    // Checkout nets the account's balance off the wallet debit it shows, and
    // the funding permit is bounded by that figure.
    expect(isInvalidated(budgetKey(HCA))).toBe(true)
    expect(isInvalidated(walletKey)).toBe(true)
    expect(isInvalidated(budgetKey(OTHER_HCA))).toBe(false)
    expect(isInvalidated(priceKey)).toBe(false)
  })
})
