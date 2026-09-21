import { describe, expect, it } from 'vitest'
import meta from './TokenPickerDialog.stories'

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
})
