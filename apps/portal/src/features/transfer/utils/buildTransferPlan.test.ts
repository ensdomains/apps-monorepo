import { describe, expect, it } from 'vitest'
import { buildTransferPlan, type TransferOptions } from './buildTransferPlan'

const NO_OPTIONS: TransferOptions = {
  resetResolver: false,
  resetRegistry: false,
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

  it('resets the registry (setSubregistry 0x0) before transferring', () => {
    const plan = buildTransferPlan({ ...NO_OPTIONS, resetRegistry: true })
    expect(plan).toEqual(['reset-registry', 'transfer-token'])
  })

  it('combines resetting the resolver and the registry', () => {
    const plan = buildTransferPlan({
      ...NO_OPTIONS,
      resetResolver: true,
      resetRegistry: true,
    })
    expect(plan).toEqual(['reset-resolver', 'reset-registry', 'transfer-token'])
  })
})
