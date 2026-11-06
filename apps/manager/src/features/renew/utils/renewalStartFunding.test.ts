import { describe, expect, it } from 'vitest'
import { getRenewalStartFunding } from './renewalStartFunding'

const displayedDebit = { usdc: 9_140_000n, token: 0n }
const l2Funding = {
  source: { chain: { id: 84_532 } } as never,
  displayedCharge: 9_300_000n,
}
const ethFunding = { usdcAmount: 9_220_000n, displayedCharge: 10n ** 15n }

const run = (
  overrides: Partial<Parameters<typeof getRenewalStartFunding>[0]>,
) =>
  getRenewalStartFunding({
    isIntentRoute: true,
    displayedDebit,
    l2Funding: undefined,
    isPaidWithEth: false,
    ethFunding: undefined,
    ...overrides,
  })

describe('getRenewalStartFunding', () => {
  it.each([
    ['the wallet debit shown', {}, { displayedDebit }],
    ['the L2 charge in place of the debit', { l2Funding }, { l2Funding }],
    [
      'the ETH swap, still checked against the debit',
      { isPaidWithEth: true, ethFunding },
      { displayedDebit, ethFunding },
    ],
    [
      'nothing on the wallet route',
      { isIntentRoute: false, displayedDebit: undefined },
      {},
    ],
    ['no ETH swap unless ETH is picked', { ethFunding }, { displayedDebit }],
  ] as const)('starts with %s', (_case, overrides, fields) => {
    expect(run(overrides)).toEqual({ status: 'ready', fields })
  })

  it.each([
    ['an intent with no amount shown', { displayedDebit: undefined }],
    ['ETH picked before the swap is priced', { isPaidWithEth: true }],
  ] as const)('refuses %s', (_case, overrides) => {
    expect(run(overrides)).toEqual({ status: 'refused' })
  })
})
