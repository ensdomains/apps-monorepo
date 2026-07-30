import { describe, expect, it } from 'vitest'
import { buildTransferPlan, type TransferOptions } from './buildTransferPlan'

const NO_OPTIONS: TransferOptions = {
  setEthAddress: false,
  resetResolver: false,
  resetRegistry: false,
}

describe('buildTransferPlan', () => {
  it('always ends with the token transfer', () => {
    expect(buildTransferPlan(NO_OPTIONS)).toEqual(['transfer-token'])
  })

  it('repoints the ETH address before transferring', () => {
    const plan = buildTransferPlan({ ...NO_OPTIONS, setEthAddress: true })
    expect(plan).toEqual(['set-eth-addr', 'transfer-token'])
  })

  it('skips the ETH step when the resolver is reset (redundant)', () => {
    const plan = buildTransferPlan({
      ...NO_OPTIONS,
      setEthAddress: true,
      resetResolver: true,
    })
    expect(plan).toEqual(['reset-resolver', 'transfer-token'])
  })

  it('resets the resolver (setResolver 0x0) before transferring', () => {
    const plan = buildTransferPlan({ ...NO_OPTIONS, resetResolver: true })
    expect(plan).toEqual(['reset-resolver', 'transfer-token'])
  })

  it('resets the registry (setSubregistry 0x0) before transferring', () => {
    const plan = buildTransferPlan({ ...NO_OPTIONS, resetRegistry: true })
    expect(plan).toEqual(['reset-registry', 'transfer-token'])
  })

  it('orders the ETH step before the registry reset', () => {
    const plan = buildTransferPlan({
      setEthAddress: true,
      resetResolver: false,
      resetRegistry: true,
    })
    expect(plan).toEqual(['set-eth-addr', 'reset-registry', 'transfer-token'])
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
