import { describe, expect, it, vi } from 'vitest'

vi.mock('@ens-apps/smart-account', () => ({
  getDestinationContracts: () => ({ ethRegistrar: '0x0', usdc: '0x0' }),
}))

import {
  GetRegisterPriceError,
  getRegisterPriceQueryOptions,
} from './pricing.query'

const throwOnError = getRegisterPriceQueryOptions('name', 1, 'USDC')
  .throwOnError as (error: Error) => boolean

describe('getRegisterPriceQueryOptions', () => {
  it('does not throw to the route when the name was just taken', () => {
    const revert = Object.assign(new Error('reverted'), {
      signature: '0x477707e8',
    })
    expect(throwOnError(new GetRegisterPriceError({ cause: revert }))).toBe(
      false,
    )
  })

  it('still throws other pricing failures', () => {
    const cause = new Error('rpc down')
    expect(throwOnError(new GetRegisterPriceError({ cause }))).toBe(true)
  })
})
