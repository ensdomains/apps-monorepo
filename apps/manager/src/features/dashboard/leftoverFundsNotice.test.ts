import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'
import {
  type LeftoverFundsRead,
  resolveLeftoverFundsNotice,
} from './leftoverFundsNotice'

const USDC: Address = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'

const read = (
  overrides: Partial<LeftoverFundsRead> = {},
): LeftoverFundsRead => ({
  isDeployed: true,
  funds: [{ token: USDC, symbol: 'USDC', decimals: 6, amount: 2_713_400n }],
  ...overrides,
})

describe('resolveLeftoverFundsNotice', () => {
  it('shows what the account holds, ready to withdraw', () => {
    expect(
      resolveLeftoverFundsNotice({ leftover: read(), isError: false }),
    ).toEqual({ kind: 'funds', amount: '2.7134 USDC' })
  })

  it('names the registration that still needs the funds', () => {
    expect(
      resolveLeftoverFundsNotice({
        leftover: read({ heldForRegistration: 'leon.eth' }),
        isError: false,
      }),
    ).toEqual({
      kind: 'held',
      amount: '2.7134 USDC',
      registrationName: 'leon.eth',
    })
  })

  it.each([
    ['still loading', { leftover: undefined, isError: false }],
    ['empty', { leftover: read({ funds: [] }), isError: false }],
    ['failed', { leftover: read(), isError: true }],
  ])('stays hidden when the read is %s', (_, params) => {
    expect(resolveLeftoverFundsNotice(params)).toEqual({ kind: 'hidden' })
  })
})
