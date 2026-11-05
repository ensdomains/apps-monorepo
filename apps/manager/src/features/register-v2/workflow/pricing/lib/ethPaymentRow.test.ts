import { describe, expect, it } from 'vitest'
import type { EthPaymentRow } from '../components/EthPaymentListItem'
import { getEthShortfallFigures } from './ethPaymentRow'

const ETH_0_0026 = 2_600_000_000_000_000n

const rowOf = (row: Partial<EthPaymentRow>): EthPaymentRow => ({
  chargeRaw: ETH_0_0026,
  balanceRaw: 10n ** 18n,
  gasReserveRaw: 0n,
  ethUsdRaw: undefined,
  isQuoteLoading: false,
  hasQuoteFailed: false,
  ...row,
})

describe('getEthShortfallFigures', () => {
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
      { short: '0.0016', needed: '0.0026', held: '0.001' },
    ],
    [
      'the gas reserve tips it over',
      { balanceRaw: ETH_0_0026, gasReserveRaw: 100_000_000_000_000n },
      { short: '0.0001', needed: '0.0027', held: '0.0026' },
    ],
    // Needed and held round to the same four digits; the shortfall still shows.
    [
      'the gap is below the rounding',
      { balanceRaw: ETH_0_0026, gasReserveRaw: 100_000_000_000n },
      { short: '0.0000001', needed: '0.0026', held: '0.0026' },
    ],
  ])('when %s', (_case, row, expected) => {
    expect(getEthShortfallFigures(rowOf(row))).toEqual(expected)
  })
})
