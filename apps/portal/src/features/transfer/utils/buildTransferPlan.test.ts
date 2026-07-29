import { describe, expect, it } from 'vitest'
import { buildTransferPlan, type TransferOptions } from './buildTransferPlan'

const NO_OPTIONS: TransferOptions = {
  resetResolver: false,
  resetRegistry: false,
}

const BOTH_TARGETS = { clearDefault: true, clearReverse: true }
const DEFAULT_ONLY = { clearDefault: true, clearReverse: false }
const ADDR_ONLY = { clearDefault: false, clearReverse: true }
const NO_TARGETS = { clearDefault: false, clearReverse: false }

describe('buildTransferPlan', () => {
  it('always ends with the token transfer', () => {
    const plan = buildTransferPlan(NO_OPTIONS, NO_TARGETS)
    expect(plan).toEqual(['transfer-token'])
  })

  it('unsets both reverse records when both hold the name', () => {
    const plan = buildTransferPlan(NO_OPTIONS, BOTH_TARGETS)
    expect(plan).toEqual([
      'unset-default-reverse',
      'unset-addr-reverse',
      'transfer-token',
    ])
  })

  it('only unsets default.reverse when that registrar holds the name', () => {
    const plan = buildTransferPlan(NO_OPTIONS, DEFAULT_ONLY)
    expect(plan).toEqual(['unset-default-reverse', 'transfer-token'])
  })

  it('only unsets addr.reverse when that registrar holds the name', () => {
    const plan = buildTransferPlan(NO_OPTIONS, ADDR_ONLY)
    expect(plan).toEqual(['unset-addr-reverse', 'transfer-token'])
  })

  it('skips unset steps when neither registrar matches', () => {
    const plan = buildTransferPlan(NO_OPTIONS, NO_TARGETS)
    expect(plan).toEqual(['transfer-token'])
  })

  it('resets the resolver (setResolver 0x0) before transferring', () => {
    const plan = buildTransferPlan(
      { ...NO_OPTIONS, resetResolver: true },
      NO_TARGETS,
    )
    expect(plan).toEqual(['reset-resolver', 'transfer-token'])
  })

  it('resets the registry (setSubregistry 0x0) before transferring', () => {
    const plan = buildTransferPlan(
      { ...NO_OPTIONS, resetRegistry: true },
      NO_TARGETS,
    )
    expect(plan).toEqual(['reset-registry', 'transfer-token'])
  })

  it('orders unset steps before resolver and registry resets', () => {
    const plan = buildTransferPlan(
      {
        resetResolver: true,
        resetRegistry: true,
      },
      BOTH_TARGETS,
    )
    expect(plan).toEqual([
      'unset-default-reverse',
      'unset-addr-reverse',
      'reset-resolver',
      'reset-registry',
      'transfer-token',
    ])
  })

  it('combines resetting the resolver and the registry', () => {
    const plan = buildTransferPlan(
      {
        ...NO_OPTIONS,
        resetResolver: true,
        resetRegistry: true,
      },
      NO_TARGETS,
    )
    expect(plan).toEqual(['reset-resolver', 'reset-registry', 'transfer-token'])
  })
})
