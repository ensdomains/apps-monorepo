import { describe, expect, it } from 'vitest'
import { buildTransferPlan, type TransferOptions } from './buildTransferPlan'

const NO_OPTIONS: TransferOptions = {
  resetResolver: false,
  deployRegistry: false,
}

describe('buildTransferPlan', () => {
  it('always ends with the token transfer', () => {
    const plan = buildTransferPlan(NO_OPTIONS)
    expect(plan).toEqual(['transfer-token'])
  })

  it('resets the resolver (setResolver 0x0) before transferring', () => {
    const plan = buildTransferPlan({ ...NO_OPTIONS, resetResolver: true })
    expect(plan).toEqual(['reset-resolver', 'transfer-token'])
  })

  it('deploys then sets the registry before transferring', () => {
    const plan = buildTransferPlan({ ...NO_OPTIONS, deployRegistry: true })
    expect(plan).toEqual(['deploy-registry', 'set-registry', 'transfer-token'])
  })

  it('combines resetting the resolver with deploying a registry', () => {
    const plan = buildTransferPlan({
      ...NO_OPTIONS,
      resetResolver: true,
      deployRegistry: true,
    })
    expect(plan).toEqual([
      'reset-resolver',
      'deploy-registry',
      'set-registry',
      'transfer-token',
    ])
  })
})
