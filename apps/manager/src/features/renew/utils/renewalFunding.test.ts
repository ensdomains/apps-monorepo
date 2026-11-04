import { describe, expect, it } from 'vitest'
import { getPaymentBreakdownFigures } from '@/features/register-v2/workflow/pricing/lib/paymentBreakdownFigures'
import {
  computeRenewalDisplayedDebit,
  computeRenewalFunding,
  decideRenewalPayment,
  getPromptWalletDebit,
  getRenewalPaymentScreen,
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

  it('bills a DAI price in DAI and the fee in USDC, each against its own credit', () => {
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
      case: 'a USDC price and fee, net of the account balance',
      selectedToken: 'USDC',
      fundedRaw: 8_800_000n,
      accountCreditRaw: { USDC: 5_000_000n },
      expected: { usdc: 3_820_000n, token: 0n },
    },
    {
      case: 'a DAI price in DAI, the fee in USDC',
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

describe('decideRenewalPayment', () => {
  const confirmed = { usdc: 6_690_000n, token: 0n }

  it.each([
    ['the same amount', confirmed, confirmed, 'proceed'],
    ['a lower amount', confirmed, { usdc: 6_000_000n, token: 0n }, 'proceed'],
    ['nothing from the wallet', confirmed, { usdc: 0n, token: 0n }, 'proceed'],
    [
      'one more unit of USDC',
      confirmed,
      { usdc: 6_690_001n, token: 0n },
      'confirm',
    ],
    [
      'more of the rent token, even with less USDC',
      { usdc: 20_000n, token: 7n },
      { usdc: 10_000n, token: 8n },
      'confirm',
    ],
    [
      'any wallet debit when nothing was confirmed',
      undefined,
      { usdc: 1n, token: 0n },
      'confirm',
    ],
    [
      'no wallet debit when nothing was confirmed',
      undefined,
      { usdc: 0n, token: 0n },
      'proceed',
    ],
  ] as const)('%s: %s', (_case, confirmedDebit, requoted, expected) => {
    expect(decideRenewalPayment({ confirmed: confirmedDebit, requoted })).toBe(
      expected,
    )
  })
})

describe('getRenewalPaymentScreen', () => {
  /** The live quote as it stands when it failed in the background. */
  const failedQuote = {
    funding: undefined,
    walletDebitFor: () => 4,
    isQuoting: false,
    hasQuoteFailed: true,
  }
  const usdcPrompt = {
    permitValue: 6_700_000n,
    requiresPermit: true,
    quotedFeeUsdc: 900_000n,
    hcaBalanceUsdc: 3_000_000n,
    requiredUsdc: 8_800_000n,
  }

  it('shows the live quote, failure included, while no attempt holds a prompt', () => {
    const screen = getRenewalPaymentScreen({
      prompt: undefined,
      selectedToken: 'USDC',
      quote: failedQuote,
    })

    expect(screen).toEqual({ ...failedQuote, isApprovalRequired: false })
  })

  it.each([
    ['fails', { hasQuoteFailed: true, isQuoting: false }],
    ['refetches', { hasQuoteFailed: false, isQuoting: true }],
  ])(
    "keeps the pending prompt's receipt when the live quote %s",
    (_case, state) => {
      const screen = getRenewalPaymentScreen({
        prompt: usdcPrompt,
        selectedToken: 'USDC',
        quote: { ...failedQuote, ...state },
      })

      expect(screen.hasQuoteFailed).toBe(false)
      expect(screen.isQuoting).toBe(false)
      expect(screen.isApprovalRequired).toBe(true)
      expect(screen.funding?.registration).toBeCloseTo(8.8)
      expect(screen.funding?.networkFee).toBeCloseTo(0.9)
      expect(screen.funding?.total).toBeCloseTo(9.7)
      expect(screen.funding?.walletDebit).toBeCloseTo(6.7)
      expect(screen.funding?.hcaCredit).toBeCloseTo(3)
      expect(screen.walletDebitFor?.('USDC')).toBeCloseTo(6.7)
      // Coins not chosen keep the earlier quote's figure.
      expect(screen.walletDebitFor?.('DAI')).toBe(4)
    },
  )

  it('bills a DAI rent in DAI and the fee in USDC', () => {
    const ONE_DAI = 10n ** 18n
    const prompt = {
      permitValue: 900_000n,
      requiresPermit: false,
      quotedFeeUsdc: 900_000n,
      hcaBalanceUsdc: 0n,
      requiredUsdc: 0n,
      token: {
        symbol: 'DAI',
        decimals: 18,
        required: 8n * ONE_DAI,
        hcaBalance: ONE_DAI,
        permitValue: 7n * ONE_DAI,
        requiresPermit: true,
      },
    }

    expect(getPromptWalletDebit(prompt)).toEqual({
      usdc: 900_000n,
      token: 7n * ONE_DAI,
    })
    const screen = getRenewalPaymentScreen({
      prompt,
      selectedToken: 'DAI',
      quote: { ...failedQuote, walletDebitFor: undefined },
    })
    expect(screen.funding?.total).toBeCloseTo(8.9)
    expect(screen.funding?.walletDebit).toBeCloseTo(7.9)
    expect(screen.funding?.hcaCredit).toBeCloseTo(1)
    expect(screen.walletDebitFor?.('DAI')).toBeCloseTo(7)
    // The rent token's permit is still a payment approval.
    expect(screen.isApprovalRequired).toBe(true)
  })
})
