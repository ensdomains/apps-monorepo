import { describe, expect, it } from 'vitest'
import {
  AUTO_SYNC_ETH_RECORD_DURING_REGISTRATION,
  getManagerRegistrationPostRegistrationSetup,
} from './registrationAutoSetup'

const OWNER = '0x2222222222222222222222222222222222222222' as const

describe('getManagerRegistrationPostRegistrationSetup', () => {
  it('returns undefined when the owner already has a primary name', () => {
    expect(
      getManagerRegistrationPostRegistrationSetup({
        ownerAddress: OWNER,
        existingPrimaryName: 'existing.eth',
      }),
    ).toBeUndefined()
  })

  it('returns undefined when there is no owner address', () => {
    expect(
      getManagerRegistrationPostRegistrationSetup({
        ownerAddress: null,
        existingPrimaryName: null,
      }),
    ).toBeUndefined()
  })

  it('enables primary-name setup when the owner has no primary name', () => {
    expect(
      getManagerRegistrationPostRegistrationSetup({
        ownerAddress: OWNER,
        existingPrimaryName: null,
      }),
    ).toEqual({
      primaryName: {
        enabled: true,
        syncEthRecord: AUTO_SYNC_ETH_RECORD_DURING_REGISTRATION,
      },
    })
  })

  it('keeps ETH-record sync configurable without relying on it to permit primary-name setup', () => {
    const setup = getManagerRegistrationPostRegistrationSetup({
      ownerAddress: OWNER,
      existingPrimaryName: null,
    })

    expect(setup?.primaryName?.enabled).toBe(true)
    expect(setup?.primaryName?.syncEthRecord).toBe(
      AUTO_SYNC_ETH_RECORD_DURING_REGISTRATION,
    )
  })
})
