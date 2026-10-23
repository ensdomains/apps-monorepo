import type { HcaFundingPrompt } from '@ens-apps/transaction-manager'
import { describe, expect, it } from 'vitest'
import {
  getDisplayedRenewalWalletDebit,
  isRenewalFundingWithinConsent,
} from './renewalPaymentConsent'

const prompt: HcaFundingPrompt = {
  permitValue: 6690000n,
  requiresPermit: true,
  requiredUsdc: 9680000n,
  quotedFeeUsdc: 10000n,
  hcaBalanceUsdc: 3000000n,
}
describe('renewal payment consent', () => {
  it.each([
    { fee: 10000n, balance: 3000000n, expected: 6690000n },
    { fee: 10001n, balance: 3000000n, expected: 6700000n },
    { fee: 10000n, balance: 10000000n, expected: 0n },
  ])(
    'rounds the displayed maximum up without floating point',
    ({ fee, balance, expected }) => {
      expect(
        getDisplayedRenewalWalletDebit({ rent: 9680000n, fee, balance }),
      ).toBe(expected)
    },
  )
  it.each([6690000n, 6689999n, 0n])(
    'accepts the same or lower wallet debit %s',
    (permitValue) => {
      expect(
        isRenewalFundingWithinConsent(
          { ...prompt, permitValue },
          6690000n,
          'USDC',
        ),
      ).toBe(true)
    },
  )
  it('requires confirmation even for a one-unit increase', () => {
    expect(
      isRenewalFundingWithinConsent(
        { ...prompt, permitValue: 6690001n },
        6690000n,
        'USDC',
      ),
    ).toBe(false)
  })
  it('does not turn a zero-dollar confirmation into a nonzero charge', () => {
    expect(
      isRenewalFundingWithinConsent({ ...prompt, permitValue: 1n }, 0n, 'USDC'),
    ).toBe(false)
  })
  it('does not invent missing or negative consent', () => {
    expect(isRenewalFundingWithinConsent(prompt, undefined, 'USDC')).toBe(false)
    expect(isRenewalFundingWithinConsent(prompt, -1n, 'USDC')).toBe(false)
  })
  it('does not reuse USDC consent for another token or an unlimited permit', () => {
    expect(isRenewalFundingWithinConsent(prompt, 6690000n, 'DAI')).toBe(false)
    expect(
      isRenewalFundingWithinConsent(
        {
          ...prompt,
          token: {
            symbol: 'DAI',
            decimals: 18,
            required: 1n,
            hcaBalance: 0n,
            permitValue: 1n,
            requiresPermit: true,
            hasUnlimitedAllowance: true,
          },
        },
        6690000n,
        'USDC',
      ),
    ).toBe(false)
  })
})
