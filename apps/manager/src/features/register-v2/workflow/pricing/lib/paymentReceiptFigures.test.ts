import { describe, expect, it } from 'vitest'
import {
  getNetworkFeeReceiptFigures,
  getPaymentReceiptFigures,
  getWalletShortfall,
} from './paymentReceiptFigures'

const funding = (overrides: {
  readonly walletDebit: number
  readonly hcaCredit: number
}) => ({ registration: 8, networkFee: 0.81, ...overrides })

describe('getPaymentReceiptFigures', () => {
  it.each([
    {
      name: 'partial balance',
      input: { funding: funding({ walletDebit: 5.81, hcaCredit: 3 }) },
      expected: { total: 8.81, applied: 3, due: 5.81 },
    },
    {
      name: 'no prior balance',
      input: { funding: funding({ walletDebit: 8.81, hcaCredit: 0 }) },
      expected: { total: 8.81, applied: 0, due: 8.81 },
    },
    {
      name: 'fully covered',
      input: { funding: funding({ walletDebit: 0, hcaCredit: 8.81 }) },
      expected: { total: 8.81, applied: 8.81, due: 0 },
    },
    {
      name: 'sub-cent figures that round apart',
      input: {
        funding: {
          registration: 1.004,
          networkFee: 1.004,
          walletDebit: 1.004,
          hcaCredit: 1.004,
        },
      },
      expected: { total: 2, applied: 1, due: 1 },
    },
    {
      name: 'price only, credit capped at the price',
      input: { funding: undefined, price: 5, accountCredit: 7 },
      expected: { total: 5, applied: 5, due: 0 },
    },
  ])('reconciles $name', ({ input, expected }) => {
    const figures = getPaymentReceiptFigures({
      price: undefined,
      accountCredit: 0,
      ...input,
    })
    expect(figures).toEqual(expected)
  })

  it('has nothing to show before a price', () => {
    expect(
      getPaymentReceiptFigures({
        funding: undefined,
        price: undefined,
        accountCredit: 0,
      }),
    ).toBeUndefined()
  })
})

describe('getWalletShortfall', () => {
  it.each([
    { required: 1, balance: 0.7, expected: 0.3 },
    { required: 5.001, balance: 5, expected: 0.01 },
    { required: 0.0412, balance: 0, expected: 0.04 },
    { required: 5.8104, balance: 5.81, expected: 0.01 },
    { required: 5, balance: 5, expected: undefined },
    { required: undefined, balance: 0, expected: undefined },
  ])(
    '$required against $balance is $expected',
    ({ required, balance, expected }) => {
      expect(getWalletShortfall(required, balance)).toBe(expected)
    },
  )
})

describe('getNetworkFeeReceiptFigures', () => {
  // USDC's 6 decimals, written as dollars and cents.
  const usd = (value: string) => BigInt(value.replace('.', '')) * 10_000n
  const figures = (
    registrationTotal: string,
    networkFee: string,
    existingBalance: string,
    due: string,
  ) => ({
    registrationTotalRaw: usd(registrationTotal),
    networkFeeRaw: usd(networkFee),
    existingBalanceRaw: usd(existingBalance),
    dueRaw: usd(due),
  })

  it.each([
    [
      'no existing balance',
      {
        registrationTotalRaw: usd('330.00'),
        networkFeeRaw: usd('5.52'),
        walletDebitRaw: usd('335.52'),
      },
      figures('330.00', '5.52', '0.00', '335.52'),
    ],
    [
      'a balance below the name cost, already in the page total',
      {
        registrationTotalRaw: usd('327.00'),
        networkFeeRaw: usd('5.52'),
        walletDebitRaw: usd('332.52'),
      },
      figures('327.00', '5.52', '0.00', '332.52'),
    ],
    [
      'a balance beyond the name cost, part of the fee',
      {
        registrationTotalRaw: 0n,
        networkFeeRaw: usd('25.46'),
        walletDebitRaw: usd('16.45'),
      },
      figures('0.00', '25.46', '9.01', '16.45'),
    ],
    [
      'a balance covering the fee as well',
      {
        registrationTotalRaw: 0n,
        networkFeeRaw: usd('5.52'),
        walletDebitRaw: 0n,
      },
      figures('0.00', '5.52', '5.52', '0.00'),
    ],
    [
      'an ETH swap paying its own gas',
      {
        registrationTotalRaw: usd('330.00'),
        networkFeeRaw: usd('5.52'),
        walletDebitRaw: usd('335.52'),
        extraFeeRaw: usd('9.25'),
      },
      figures('330.00', '14.77', '0.00', '344.77'),
    ],
    [
      'sub-cent figures, rounded half up to cents',
      {
        registrationTotalRaw: 330_004_000n,
        networkFeeRaw: usd('5.52'),
        walletDebitRaw: 335_526_000n,
      },
      figures('330.00', '5.53', '0.00', '335.53'),
    ],
    [
      'a cent of rounding the other way, still no balance line',
      {
        registrationTotalRaw: usd('330.00'),
        networkFeeRaw: 5_524_000n,
        walletDebitRaw: 335_514_000n,
      },
      figures('330.00', '5.51', '0.00', '335.51'),
    ],
  ])('%s', (_case, input, expected) => {
    expect(getNetworkFeeReceiptFigures(input)).toEqual(expected)
  })
})
