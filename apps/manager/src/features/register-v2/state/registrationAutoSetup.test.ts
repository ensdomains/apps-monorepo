import { describe, expect, it } from 'vitest'
import { getManagerRegistrationPostRegistrationSetup } from './registrationAutoSetup'

describe('getManagerRegistrationPostRegistrationSetup', () => {
  it('returns undefined when there is no owner address', () => {
    expect(
      getManagerRegistrationPostRegistrationSetup({
        ownerAddress: undefined,
        existingPrimaryName: null,
      }),
    ).toBeUndefined()
  })

  it('returns undefined when the user already has a primary name', () => {
    expect(
      getManagerRegistrationPostRegistrationSetup({
        ownerAddress: '0x1111111111111111111111111111111111111111',
        existingPrimaryName: 'existing.eth',
      }),
    ).toBeUndefined()
  })

  it('enables setup when the user has an owner address and no primary name', () => {
    expect(
      getManagerRegistrationPostRegistrationSetup({
        ownerAddress: '0x1111111111111111111111111111111111111111',
        existingPrimaryName: null,
      }),
    ).toEqual({
      primaryName: {
        enabled: true,
        syncEthRecord: true,
      },
    })
  })
})
