import { describe, expect, it } from 'vitest'
import { getRegistrationFundingAmount } from './registration.funding'

describe('registration funding after approval', () => {
  it.each([
    [15n, 0n, 15n],
    [15n, 5n, 10n],
    [15n, 15n, 0n],
    [15n, 16n, 0n],
  ])(
    'funds target %s from balance %s without increasing consent',
    (targetBalance, balance, amount) => {
      expect(
        getRegistrationFundingAmount({
          targetBalance,
          balance,
          consented: 15n,
        })._unsafeUnwrap(),
      ).toBe(amount)
    },
  )

  it('refuses to grow a pull above a reserved approval after the balance falls', () => {
    const result = getRegistrationFundingAmount({
      targetBalance: 15n,
      balance: 2n,
      consented: 4n,
    })
    expect(result._unsafeUnwrapErr().message).toContain(
      'Review a fresh registration quote',
    )
  })
})
