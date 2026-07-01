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

  it('sets the default address first (on the current resolver), before transferring', () => {
    const plan = buildTransferPlan({
      setDefaultAddress: true,
      deployResolver: false,
      deployRegistry: false,
    })
    expect(plan).toEqual(['set-default-address', 'transfer-token'])
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

  it('drops set-default-address when a new resolver is deployed (can not coexist)', () => {
    const plan = buildTransferPlan({
      setDefaultAddress: true,
      deployResolver: true,
      deployRegistry: false,
    })
    // No 'set-default-address' — the new resolver is the recipient's.
    expect(plan).toEqual(['deploy-resolver', 'set-resolver', 'transfer-token'])
  })

  it('orders default address (current resolver), then registry, then transfer', () => {
    const plan = buildTransferPlan({
      setDefaultAddress: true,
      deployResolver: false,
      deployRegistry: true,
    })
    expect(plan).toEqual([
      'set-default-address',
      'deploy-registry',
      'set-registry',
      'transfer-token',
    ])
  })
})
