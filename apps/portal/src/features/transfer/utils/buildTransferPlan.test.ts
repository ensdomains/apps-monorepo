import { describe, expect, it } from 'vitest'
import { buildTransferPlan } from './buildTransferPlan'

describe('buildTransferPlan', () => {
  it('always ends with the token transfer', () => {
    const plan = buildTransferPlan({
      setDefaultAddress: false,
      deployResolver: false,
      deployRegistry: false,
    })
    expect(plan).toEqual(['transfer-token'])
  })

  it('deploys then sets the resolver before transferring', () => {
    const plan = buildTransferPlan({
      setDefaultAddress: false,
      deployResolver: true,
      deployRegistry: false,
    })
    expect(plan).toEqual(['deploy-resolver', 'set-resolver', 'transfer-token'])
  })

  it('deploys then sets the registry before transferring', () => {
    const plan = buildTransferPlan({
      setDefaultAddress: false,
      deployResolver: false,
      deployRegistry: true,
    })
    expect(plan).toEqual(['deploy-registry', 'set-registry', 'transfer-token'])
  })

  it('sets the default address before transferring', () => {
    const plan = buildTransferPlan({
      setDefaultAddress: true,
      deployResolver: false,
      deployRegistry: false,
    })
    expect(plan).toEqual(['set-default-address', 'transfer-token'])
  })

  it('orders resolver, then registry, then default address, then transfer', () => {
    const plan = buildTransferPlan({
      setDefaultAddress: true,
      deployResolver: true,
      deployRegistry: true,
    })
    expect(plan).toEqual([
      'deploy-resolver',
      'set-resolver',
      'deploy-registry',
      'set-registry',
      'set-default-address',
      'transfer-token',
    ])
  })
})
