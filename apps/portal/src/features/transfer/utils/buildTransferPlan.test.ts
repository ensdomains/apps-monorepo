import { describe, expect, it } from 'vitest'
import { buildTransferPlan } from './buildTransferPlan'

describe('buildTransferPlan', () => {
  it('always ends with the token transfer', () => {
    const plan = buildTransferPlan({
      deployResolver: false,
      deployRegistry: false,
    })
    expect(plan).toEqual(['transfer-token'])
  })

  it('deploys then sets the resolver before transferring', () => {
    const plan = buildTransferPlan({
      deployResolver: true,
      deployRegistry: false,
    })
    expect(plan).toEqual(['deploy-resolver', 'set-resolver', 'transfer-token'])
  })

  it('deploys then sets the registry before transferring', () => {
    const plan = buildTransferPlan({
      deployResolver: false,
      deployRegistry: true,
    })
    expect(plan).toEqual(['deploy-registry', 'set-registry', 'transfer-token'])
  })

  it('orders resolver, then registry, then transfer', () => {
    const plan = buildTransferPlan({
      deployResolver: true,
      deployRegistry: true,
    })
    expect(plan).toEqual([
      'deploy-resolver',
      'set-resolver',
      'deploy-registry',
      'set-registry',
      'transfer-token',
    ])
  })
})
