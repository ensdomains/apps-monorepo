import { describe, expect, it } from 'vitest'
import type { EthPaymentRow } from '../components/EthPaymentListItem'
import {
  getEthPaymentDebit,
  getEthPaymentRow,
  getEthShortfall,
  getEthSwapDebitUsdcRaw,
} from './ethPaymentRow'

const ETH_0_0026 = 2_600_000_000_000_000n

const rowOf = (row: Partial<EthPaymentRow>): EthPaymentRow => ({
  chargeRaw: ETH_0_0026,
  balanceRaw: 10n ** 18n,
  gasReserveRaw: 0n,
  walletUsdcRaw: 0n,
  ethUsdRaw: undefined,
  isQuoteLoading: false,
  hasQuoteFailed: false,
  ...row,
})

describe('getEthSwapDebitUsdcRaw', () => {
  it.each([
    [
      'nothing to swap',
      { chargeRaw: 0n, ethUsdRaw: 200_000_000_000n },
      undefined,
    ],
    ['unpriced', {}, undefined],
    ['priced', { ethUsdRaw: 200_000_000_000n }, 5_200_000n],
  ])('%s', (_case, row, expected) => {
    expect(getEthSwapDebitUsdcRaw(rowOf(row))).toBe(expected)
  })
})

describe('getEthPaymentRow', () => {
  const quoteOf = (usdcToBuy: bigint) => ({
    data: {
      usdcToBuy,
      swap: { maximumEth: ETH_0_0026 },
      walletBalance: 10n ** 18n,
      gasReserve: 0n,
      ethUsd: 200_000_000_000n,
    },
    isPending: false,
    isPlaceholderData: false,
    isError: false,
  })

  it.each([
    ['holds no USDC', 5_000_000n, 0n],
    ['holds some USDC', 1_800_000n, 3_200_000n],
  ])('spends the USDC the wallet %s before swapping', (_case, toBuy, spent) => {
    expect(getEthPaymentRow(quoteOf(toBuy), 5_000_000n).walletUsdcRaw).toBe(
      spent,
    )
  })
})

describe('getEthPaymentDebit', () => {
  it.each([
    ['unpriced', {}, undefined],
    [
      'a wallet holding no USDC',
      { ethUsdRaw: 200_000_000_000n },
      { usdcRaw: 0n, ethWei: ETH_0_0026, swapUsdcRaw: 5_200_000n },
    ],
    [
      'a wallet spending its USDC too',
      { ethUsdRaw: 200_000_000_000n, walletUsdcRaw: 3_200_000n },
      { usdcRaw: 3_200_000n, ethWei: ETH_0_0026, swapUsdcRaw: 5_200_000n },
    ],
    [
      'the swap gas, one estimate of the doubled reserve',
      { ethUsdRaw: 200_000_000_000n, gasReserveRaw: 200_000_000_000_000n },
      {
        usdcRaw: 0n,
        ethWei: ETH_0_0026 + 100_000_000_000_000n,
        swapUsdcRaw: 5_200_000n,
      },
    ],
  ])('for %s', (_case, row, expected) => {
    expect(getEthPaymentDebit(rowOf(row))).toEqual(expected)
  })
})

describe('getEthShortfall', () => {
  it.each([
    ['the wallet covers the swap', {}, undefined],
    [
      'nothing is quoted yet',
      { chargeRaw: undefined, balanceRaw: 0n },
      undefined,
    ],
    [
      'the wallet is short of the swap',
      { balanceRaw: 1_000_000_000_000_000n },
      '0.0016',
    ],
    [
      'the gas reserve tips it over',
      { balanceRaw: ETH_0_0026, gasReserveRaw: 100_000_000_000_000n },
      '0.0001',
    ],
    // A gap below the four shown digits still has a figure of its own.
    [
      'the gap is below the rounding',
      { balanceRaw: ETH_0_0026, gasReserveRaw: 100_000_000_000n },
      '0.0000001',
    ],
  ])('when %s', (_case, row, expected) => {
    expect(getEthShortfall(rowOf(row))).toBe(expected)
  })
})
