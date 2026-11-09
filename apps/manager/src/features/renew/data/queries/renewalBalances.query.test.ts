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
  it.each([
    ['paid with ETH', { isPaidWithEth: true }],
    ['paid from an L2', { isPaidWithEth: false, l2ChainId: 84_532 }],
  ])(
    'counts what the account holds of Circle’s USDC as its USDC when %s',
    (_case, method) => {
      const paid = getPaymentBalances(balances(1_500_000n), method)

      expect(paid.accountCredit).toEqual({ USDC: 1.5, DAI: 2 })
      expect(paid.accountCreditRaw).toEqual({
        USDC: 1_500_000n,
        DAI: 2n * 10n ** 18n,
      })
    },
  )

  it('credits no USDC when that balance could not be read', () => {
    const paid = getPaymentBalances(balances(), { isPaidWithEth: true })

    expect(paid.accountCredit).toEqual({ DAI: 2 })
    expect(paid.accountCreditRaw).toEqual({ DAI: 2n * 10n ** 18n })
  })

  it('leaves the balances alone for any other payment', () => {
    const own = balances(1_500_000n)

    expect(getPaymentBalances(own, { isPaidWithEth: false })).toBe(own)
  })
})
