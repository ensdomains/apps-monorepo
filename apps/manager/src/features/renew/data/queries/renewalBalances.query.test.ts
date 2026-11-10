import { describe, expect, it } from 'vitest'
import {
  getPaymentBalances,
  type RenewalBalances,
} from './renewalBalances.query'

const balances = (circleCreditRaw?: bigint): RenewalBalances => ({
  wallet: [],
  accountCredit: { USDC: 5, DAI: 2 },
  accountCreditRaw: { USDC: 5_000_000n, DAI: 2n * 10n ** 18n },
  circleCreditRaw,
})

describe('getPaymentBalances', () => {
  it('counts what the account holds of Circle’s USDC as its USDC when paid in it', () => {
    const paid = getPaymentBalances(balances(1_500_000n), true)

    expect(paid.accountCredit).toEqual({ USDC: 1.5, DAI: 2 })
    expect(paid.accountCreditRaw).toEqual({
      USDC: 1_500_000n,
      DAI: 2n * 10n ** 18n,
    })
  })

  it('credits no USDC when that balance could not be read', () => {
    const paid = getPaymentBalances(balances(), true)

    expect(paid.accountCredit).toEqual({ DAI: 2 })
    expect(paid.accountCreditRaw).toEqual({ DAI: 2n * 10n ** 18n })
  })

  it('leaves the balances alone for any other payment', () => {
    const own = balances(1_500_000n)

    expect(getPaymentBalances(own, false)).toBe(own)
  })
})
