import { describe, expect, it } from 'vitest'
import { getPaymentBreakdownFigures } from '@/features/register-v2/workflow/pricing/lib/paymentBreakdownFigures'
import {
  computeRenewalDisplayedDebit,
  computeRenewalFunding,
} from './renewalFunding'

describe('computeRenewalFunding', () => {
  it('deducts the account balance once and keeps the headroom out of the displayed fee', () => {
    const { summary, walletDebitFor } = computeRenewalFunding({
      funded: 8.8,
      networkFee: 0.02,
      selectedToken: 'USDC',
      accountCredit: { USDC: 5 },
    })

    expect(summary.total).toBeCloseTo(8.82)
    expect(summary.walletDebit).toBeCloseTo(3.82)
    expect(summary.hcaCredit).toBe(5)
    expect(walletDebitFor('USDC')).toBeCloseTo(3.82)
    expect(getPaymentBreakdownFigures(summary).networkFee).toBeCloseTo(0.02)
  })

  it('bills a DAI rent in DAI and the fee in USDC, each against its own credit', () => {
    const { summary, walletDebitFor } = computeRenewalFunding({
      funded: 8.8,
      networkFee: 0.02,
      selectedToken: 'DAI',
      accountCredit: { USDC: 5 },
    })

    expect(summary.total).toBeCloseTo(8.82)
    expect(summary.walletDebit).toBeCloseTo(8.8)
    expect(summary.hcaCredit).toBeCloseTo(0.02)
    expect(walletDebitFor('DAI')).toBeCloseTo(8.8)
    expect(walletDebitFor('USDC')).toBeCloseTo(3.82)
  })
})

describe('computeRenewalDisplayedDebit', () => {
  const ONE_DAI = 10n ** 18n

  it.each([
    {
      case: 'a USDC rent and fee, net of the account balance',
      selectedToken: 'USDC',
      fundedRaw: 8_800_000n,
      accountCreditRaw: { USDC: 5_000_000n },
      expected: { usdc: 3_820_000n, token: 0n },
    },
    {
      case: 'a DAI rent in DAI, the fee in USDC',
      selectedToken: 'DAI',
      fundedRaw: 8n * ONE_DAI,
      accountCreditRaw: { USDC: 5_000n, DAI: ONE_DAI },
      expected: { usdc: 15_000n, token: 7n * ONE_DAI },
    },
    {
      case: 'nothing when the account covers both',
      selectedToken: 'DAI',
      fundedRaw: 8n * ONE_DAI,
      accountCreditRaw: { USDC: 1_000_000n, DAI: 9n * ONE_DAI },
      expected: { usdc: 0n, token: 0n },
    },
  ] as const)('shows $case', ({ expected, ...params }) => {
    expect(
      computeRenewalDisplayedDebit({ ...params, networkFeeRaw: 20_000n }),
    ).toEqual(expected)
  })
})
