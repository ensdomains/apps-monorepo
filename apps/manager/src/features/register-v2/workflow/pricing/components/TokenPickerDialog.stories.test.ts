import { describe, expect, it } from 'vitest'
import meta, {
  FundedUSDC,
  FundedWithUnavailableUSDC,
  InvalidDAI,
  InvalidUSDC,
} from './TokenPickerDialog.stories'

describe('TokenPickerDialog stories', () => {
  it('keeps the inherited USDC and DAI payment options', () => {
    expect(meta.args.stablecoinBalances.map(({ symbol }) => symbol)).toEqual([
      'USDC',
      'DAI',
    ])
    expect(meta.argTypes.initialSelectedToken.options).toEqual([
      undefined,
      'USDC',
      'DAI',
    ])
  })

  it('keeps deterministic funded and insufficient USDC evidence', () => {
    expect(FundedUSDC.args?.initialSelectedToken).toBe('USDC')
    expect(FundedUSDC.args?.funding?.isUnderfunded).toBe(false)
    expect(InvalidUSDC.args?.initialSelectedToken).toBe('USDC')
    expect(
      InvalidUSDC.args?.stablecoinBalances?.find(
        ({ symbol }) => symbol === 'USDC',
      )?.formattedBalance,
    ).toBe('10.00')
    expect(InvalidUSDC.args?.funding?.isUnderfunded).toBe(true)
  })

  it('covers a funded selection beside an unavailable network-fee row', () => {
    expect(FundedWithUnavailableUSDC.args?.initialSelectedToken).toBe('DAI')
    expect(
      FundedWithUnavailableUSDC.args?.stablecoinBalances?.map(
        ({ symbol }) => symbol,
      ),
    ).toEqual(['DAI', 'USDC'])
    expect(FundedWithUnavailableUSDC.args?.funding?.isUnderfunded).toBe(true)
  })

  it('keeps deterministic insufficient-DAI evidence separate from USDC funding', () => {
    expect(InvalidDAI.args?.initialSelectedToken).toBe('DAI')
    expect(
      InvalidDAI.args?.stablecoinBalances?.find(
        ({ symbol }) => symbol === 'DAI',
      )?.formattedBalance,
    ).toBe('5.00')
    expect(InvalidDAI.args?.funding?.isUnderfunded).toBe(false)
    expect(InvalidDAI.args?.pricingData).toBe(352)
  })
})
