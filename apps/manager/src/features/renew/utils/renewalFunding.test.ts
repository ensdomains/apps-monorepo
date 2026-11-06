import { describe, expect, it } from 'vitest'
import { getPaymentBreakdownFigures } from '@/features/register-v2/workflow/pricing/lib/paymentBreakdownFigures'
import {
  computeRenewalDisplayedDebit,
  computeRenewalFunding,
  decideRenewalPayment,
  getPromptWalletDebit,
  getRenewalCheckoutTotalRaw,
  getRenewalFeeQuoteState,
  getRenewalPaymentScreen,
  getRenewalReceiptTotalRaw,
  isRenewalReceiptReady,
} from './renewalFunding'

describe('getRenewalCheckoutTotalRaw', () => {
  const DAI = 10n ** 12n
  it.each([
    ['less the account balance', 8_800_000n, 5_000_000n, 6, 3_800_000n],
    ['never below zero', 8_800_000n, 20_000_000n, 6, 0n],
    [
      'in USDC units for a DAI price',
      8_800_000n * DAI,
      5_000_000n * DAI,
      18,
      3_800_000n,
    ],
    [
      'unknown while the balance is unread',
      8_800_000n,
      undefined,
      6,
      undefined,
    ],
    ['unknown while unpriced', undefined, 5_000_000n, 6, undefined],
  ] as const)(
    'is the funded price %s',
    (_case, fundedRaw, accountBalanceRaw, decimals, expected) => {
      expect(
        getRenewalCheckoutTotalRaw({ fundedRaw, accountBalanceRaw, decimals }),
      ).toBe(expected)
    },
  )
})

describe('isRenewalReceiptReady', () => {
  it.each([
    ['the intent route with its total', true, 3_800_000n, true],
    ['the intent route before the balance is read', true, undefined, false],
    ['the wallet route, which shows no receipt total', false, undefined, true],
  ] as const)('%s: %s', (_case, isIntentRoute, checkoutTotalRaw, expected) => {
    expect(isRenewalReceiptReady({ isIntentRoute, checkoutTotalRaw })).toBe(
      expected,
    )
  })
})

describe('getRenewalReceiptTotalRaw', () => {
  const prompt = {
    permitValue: 4_000_000n,
    requiresPermit: true,
    quotedFeeUsdc: 330_000n,
    hcaBalanceUsdc: 5_000_000n,
    requiredUsdc: 8_800_000n,
  }

  // The balance read before the review is gone; the prompt's figures stand.
  const live = {
    fundedRaw: 8_800_000n,
    accountBalanceRaw: 8_000_000n,
    decimals: 6,
  }

  it('reads the review total off the prompt, not the balance read before it', () => {
    expect(getRenewalReceiptTotalRaw({ ...live, prompt })).toBe(3_800_000n)
  })

  it('uses the live price and balance while nothing is under review', () => {
    expect(getRenewalReceiptTotalRaw({ ...live, prompt: undefined })).toBe(
      800_000n,
    )
  })

  it('takes a DAI price and balance from the token leg, in USDC units', () => {
    expect(
      getRenewalReceiptTotalRaw({
        ...live,
        prompt: {
          ...prompt,
          requiredUsdc: 0n,
          token: {
            symbol: 'DAI',
            decimals: 18,
            required: 8_800_000n * 10n ** 12n,
            hcaBalance: 1_000_000n * 10n ** 12n,
            permitValue: 7_800_000n * 10n ** 12n,
            requiresPermit: true,
          },
        },
      }),
    ).toBe(7_800_000n)
  })
})

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
  const usdcAmounts = [0n, 10_000n, 20_000n] as const
  const tokenAmounts = [0n, 10n ** 16n, 2n * 10n ** 16n] as const
  const debits = usdcAmounts.flatMap((usdc) =>
    tokenAmounts.map((token) => ({ usdc, token })),
  )
  const paymentMatrix = [undefined, ...debits].flatMap((confirmedDebit) =>
    debits.map((requoted) => ({ confirmedDebit, requoted })),
  )

  it.each(paymentMatrix)(
    'requires consent exactly when $requoted exceeds $confirmedDebit in either coin',
    ({ confirmedDebit, requoted }) => {
      const ceiling = confirmedDebit ?? { usdc: 0n, token: 0n }
      const expected =
        requoted.usdc > ceiling.usdc || requoted.token > ceiling.token
          ? 'confirm'
          : 'proceed'

      expect(
        decideRenewalPayment({
          confirmed: confirmedDebit,
          requoted,
          tokenDecimals: 18,
        }),
      ).toBe(expected)
    },
  )

  it.each([
    ['the same amount', confirmed, confirmed, 'proceed'],
    ['a lower amount', confirmed, { usdc: 6_000_000n, token: 0n }, 'proceed'],
    ['nothing from the wallet', confirmed, { usdc: 0n, token: 0n }, 'proceed'],
    [
      'a fraction of a cent more, within the cent shown',
      { usdc: 2_690_100n, token: 0n },
      { usdc: 2_692_000n, token: 0n },
      'proceed',
    ],
    [
      'one cent more of USDC',
      confirmed,
      { usdc: 6_700_000n, token: 0n },
      'confirm',
    ],
    [
      'a cent more of the rent token, even with less USDC',
      { usdc: 20_000n, token: 7n * 10n ** 16n },
      { usdc: 10_000n, token: 8n * 10n ** 16n },
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
    expect(
      decideRenewalPayment({
        confirmed: confirmedDebit,
        requoted,
        tokenDecimals: 18,
      }),
    ).toBe(expected)
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

  it('keeps the unlimited DAI approval warning on the updated receipt', () => {
    const ONE_DAI = 10n ** 18n
    const screen = getRenewalPaymentScreen({
      prompt: {
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
          hasUnlimitedAllowance: true,
        },
      },
      selectedToken: 'DAI',
      quote: { ...failedQuote, walletDebitFor: undefined },
    })

    expect(screen).toHaveProperty('hasUnlimitedAllowance', true)
  })

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

describe('getRenewalFeeQuoteState', () => {
  const quote = {
    isActive: true,
    isFetching: false,
    isError: false,
    feeRaw: 120_000n as bigint | null | undefined,
  }

  it.each([
    ['a priced fee', {}, { isQuoting: false, hasQuoteFailed: false }],
    [
      'the first quote loading',
      { isFetching: true, feeRaw: undefined },
      { isQuoting: true, hasQuoteFailed: false },
    ],
    [
      'a refresh behind a priced fee',
      { isFetching: true },
      { isQuoting: false, hasQuoteFailed: false },
    ],
    [
      'an error',
      { isError: true, feeRaw: undefined },
      { isQuoting: false, hasQuoteFailed: true },
    ],
    [
      'a fee the rail refused to price',
      { feeRaw: null },
      { isQuoting: false, hasQuoteFailed: true },
    ],
    [
      'a retry after a failure',
      { isError: true, isFetching: true, feeRaw: undefined },
      { isQuoting: true, hasQuoteFailed: false },
    ],
    [
      'the payment step closed',
      { isActive: false, isError: true },
      { isQuoting: false, hasQuoteFailed: false },
    ],
  ] as const)('%s', (_case, overrides, expected) => {
    expect(getRenewalFeeQuoteState({ ...quote, ...overrides })).toEqual(
      expected,
    )
  })
})
