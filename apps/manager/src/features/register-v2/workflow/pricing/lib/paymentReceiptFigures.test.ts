import { describe, expect, it } from 'vitest'
import {
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
