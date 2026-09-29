import { describe, expect, it } from 'vitest'
import { envConfig } from '@/config'

import { getRenewalRoute, getRenewerAddress } from './renewalProtocol'

describe('renewal protocol selection', () => {
  it('selects the V1 renewer and canonical route', () => {
    expect(getRenewerAddress('v1')).toBe(
      envConfig.chain.contracts.ensEthRenewerV1.address,
    )
    expect(getRenewalRoute('v1')).toBe('/renew-v1/$name')
  })

  it('selects the V2 registrar and canonical route', () => {
    expect(getRenewerAddress('v2')).toBe(
      envConfig.chain.contracts.ensEthRegistrar.address,
    )
    expect(getRenewalRoute('v2')).toBe('/renew/$name')
  })
})
