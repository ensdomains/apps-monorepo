import { describe, expect, it } from 'vitest'
import { getBulkRenewListFigures } from './bulkListFigures'

describe('getBulkRenewListFigures', () => {
  const run = (
    overrides: Partial<Parameters<typeof getBulkRenewListFigures>[0]>,
  ) =>
    getBulkRenewListFigures({
      isIntentRoute: true,
      priceRaw: 27_880_000n,
      accountBalanceRaw: 0n,
      decimals: 6,
      grandTotal: 27.88,
      ...overrides,
    })

  it.each([
    ['no balance', {}, { appliedBalance: 0, listTotal: 27.88 }],
    [
      'a balance, taken off the total',
      { accountBalanceRaw: 12_506n },
      { appliedBalance: 0.012506, listTotal: 27.867494 },
    ],
    [
      'a balance under half a cent, hidden but still in the total',
      { priceRaw: 27_886_000n, accountBalanceRaw: 4_000n, grandTotal: 27.886 },
      { appliedBalance: 0, listTotal: 27.882 },
    ],
    [
      'the wallet route, which applies no balance',
      { isIntentRoute: false, accountBalanceRaw: 12_506n },
      { appliedBalance: 0, listTotal: 27.88 },
    ],
    [
      'the balance still loading, so no total yet',
      { accountBalanceRaw: undefined },
      { appliedBalance: 0, listTotal: undefined },
    ],
    [
      'a new duration still pricing, so no total yet',
      { priceRaw: undefined },
      { appliedBalance: 0, listTotal: undefined },
    ],
  ] as const)('with %s', (_case, overrides, expected) => {
    expect(run(overrides)).toEqual(expected)
  })
})
