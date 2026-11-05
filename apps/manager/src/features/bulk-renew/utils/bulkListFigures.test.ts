import { describe, expect, it } from 'vitest'
import { getBulkRenewListFigures } from './bulkListFigures'

describe('getBulkRenewListFigures', () => {
  const run = (
    overrides: Partial<Parameters<typeof getBulkRenewListFigures>[0]>,
  ) =>
    getBulkRenewListFigures({
      isIntentRoute: true,
      fundedRaw: 27_880_000n,
      checkoutTotalRaw: 27_880_000n,
      decimals: 6,
      grandTotal: 27.88,
      ...overrides,
    })

  it.each([
    ['no balance', {}, { appliedBalance: 0, listTotal: 27.88 }],
    [
      'a balance, taken off the total',
      { checkoutTotalRaw: 27_867_494n },
      { appliedBalance: 0.012506, listTotal: 27.867494 },
    ],
    [
      'a balance under half a cent, hidden but still in the total',
      {
        fundedRaw: 27_886_000n,
        checkoutTotalRaw: 27_882_000n,
        grandTotal: 27.886,
      },
      { appliedBalance: 0, listTotal: 27.882 },
    ],
    [
      'the wallet route, which applies no balance',
      { isIntentRoute: false, checkoutTotalRaw: 27_867_494n },
      { appliedBalance: 0, listTotal: 27.88 },
    ],
    [
      'a total not read yet',
      { checkoutTotalRaw: undefined },
      { appliedBalance: 0, listTotal: 27.88 },
    ],
  ] as const)('with %s', (_case, overrides, expected) => {
    expect(run(overrides)).toEqual(expected)
  })
})
