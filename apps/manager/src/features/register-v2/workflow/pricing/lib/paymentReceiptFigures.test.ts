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
  it.each([
    [
      'no existing balance',
      { registrationTotal: 330, networkFee: 5.52, walletDebit: 335.52 },
      {
        registrationTotal: 330,
        networkFee: 5.52,
        existingBalance: 0,
        due: 335.52,
      },
    ],
    [
      'a balance below the name cost, already in the page total',
      { registrationTotal: 327, networkFee: 5.52, walletDebit: 332.52 },
      {
        registrationTotal: 327,
        networkFee: 5.52,
        existingBalance: 0,
        due: 332.52,
      },
    ],
    [
      'a balance beyond the name cost, part of the fee',
      { registrationTotal: 0, networkFee: 25.46, walletDebit: 16.45 },
      {
        registrationTotal: 0,
        networkFee: 25.46,
        existingBalance: 9.01,
        due: 16.45,
      },
    ],
    [
      'a balance covering the fee as well',
      { registrationTotal: 0, networkFee: 5.52, walletDebit: 0 },
      { registrationTotal: 0, networkFee: 5.52, existingBalance: 5.52, due: 0 },
    ],
    [
      'an ETH swap paying its own gas',
      {
        registrationTotal: 330,
        networkFee: 5.52,
        walletDebit: 335.52,
        extraFee: 9.25,
      },
      {
        registrationTotal: 330,
        networkFee: 14.77,
        existingBalance: 0,
        due: 344.77,
      },
    ],
    [
      'a cent of rounding, kept off the balance',
      { registrationTotal: 330.004, networkFee: 5.52, walletDebit: 335.526 },
      {
        registrationTotal: 330,
        networkFee: 5.53,
        existingBalance: 0,
        due: 335.53,
      },
    ],
    [
      'a cent of rounding the other way, still no balance line',
      { registrationTotal: 330, networkFee: 5.524, walletDebit: 335.514 },
      {
        registrationTotal: 330,
        networkFee: 5.51,
        existingBalance: 0,
        due: 335.51,
      },
    ],
  ])('%s', (_case, input, expected) => {
    expect(getNetworkFeeReceiptFigures(input)).toEqual(expected)
  })
})
